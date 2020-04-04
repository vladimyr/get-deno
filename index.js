'use strict';

const { promisify } = require('util');
const { extname, join } = require('path');
const debug = require('debug')('http');
const miss = require('mississippi');
const parseLink = require('github-parse-link');
const pDoWhilst = require('p-do-whilst');
const pkg = require('./package.json');
const platform = require('os').platform();
const yauzl = require('yauzl');
const zlib = require('zlib');

const ua = join(pkg.name, pkg.version);
const client = require('gh-got').extend({
  headers: { 'user-agent': ua }
});

const castArray = arg => Array.isArray(arg) ? arg : [arg];
const isHttpError = err => err instanceof client.HTTPError;
const loadZip = promisify(yauzl.fromBuffer);

class InstallationError extends Error {}

module.exports = {
  download,
  fetchRelease,
  listReleases,
  InstallationError
};

async function download(version = 'latest', os = platform) {
  const release = await fetchRelease(version);
  debug('found release: %j', release);
  debug('available artifacts: %j', Array.from(release.files.keys()));
  const filenames = castArray(pkg.config.artifacts[os] || []);
  const filename = filenames.find(it => release.files.has(it));
  if (!filename) {
    throw new InstallationError(`Unsupported platform: ${platform}`);
  }
  const type = extname(filename).replace(/^\./, '');
  const { size, downloadUrl: url } = release.files.get(filename);
  debug('downloading binary from: url=%s [type=%s, size=%i]', url, type, size);
  let unarchiver;
  if (type === 'gz') unarchiver = zlib.createGunzip();
  else if (type === 'zip') unarchiver = createUnzip();
  else throw new InstallationError(`Unsupported file type: ${filename}`);
  let downloadedSize = 0;
  const downloadStream = client.stream(url, { token: null });
  const outputStream = miss.pipe(downloadStream, unarchiver);
  downloadStream.on('data', buf => {
    downloadedSize += Buffer.byteLength(buf);
    outputStream.emit('download:progress', downloadedSize / size, downloadedSize, size);
  });
  const metadata = { filename, size, url, version: release.tag };
  return Object.assign(outputStream, { metadata });
}

async function fetchRelease(version = 'latest') {
  debug('fetch single release: %s', version);
  try {
    const [release] = await listReleases(version);
    return release;
  } catch (reason) {
    if (!isHttpError(reason) || reason.statusCode !== 404) throw reason;
    const err = new InstallationError(`Release not found: ${version}`);
    err.reason = reason;
    throw err;
  }
}

async function listReleases(version) {
  const releases = [];
  let url = join('/repos/', pkg.config.repo, '/releases');
  if (version === 'latest') url = join(url, '/latest');
  else if (version) url = join(url, '/tags/', version);
  let finished = false;
  await pDoWhilst(async () => {
    debug('fetch releases: url=%s', url);
    const resp = await client.get(url);
    const link = parseLink(resp.headers.link);
    debug('`Link` header: %j', link);
    if (link.next) url = link.next;
    else finished = true;
    releases.push(...castArray(resp.body).map(it => processRelease(it)));
  }, () => !finished);
  return releases;
}

function processRelease(release) {
  const files = new Map(release.assets.map(it => [
    it.name, {
      filename: it.name,
      size: it.size,
      downloadUrl: it.browser_download_url,
      ...getTimestamps(it)
    }
  ]));
  return {
    tag: release.tag_name,
    url: release.html_url,
    prerelase: release.prerelase,
    ...getTimestamps(release),
    files
  };
}

function getTimestamps({ created_at: createdAt, published_at: publishedAt }) {
  return { createdAt, publishedAt };
}

function createUnzip() {
  const debug = require('debug')('unzip');
  const writer = miss.through();
  const reader = miss.concat(async buf => {
    try {
      const zipfile = await loadZip(buf, { lazyEntries: true });
      const openReadStream = promisify(zipfile.openReadStream.bind(zipfile));
      zipfile.on('error', err => writer.emit('error', err));
      zipfile.on('entry', async entry => {
        debug('entry found: %s', entry.fileName);
        try {
          const stream = await openReadStream(entry);
          miss.pipe(stream, writer);
        } catch (err) {
          writer.emit('error', err);
        }
      });
      zipfile.readEntry();
    } catch (err) {
      writer.emit('error', err);
    }
  });
  return miss.duplex(reader, writer);
}
