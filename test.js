'use strict';

const client = require('./');
const ms = require('ms');
const pkg = require('./package.json');
const test = require('tape');

const values = obj => Object.keys(obj).map(it => obj[it]);

test('Fetch releases from official repo', async t => {
  const releases = await client.listReleases();
  t.plan(2);
  t.assert(releases.length > 0, `found ${releases.length} releases`);
  t.equals(releases[releases.length - 1].tag, 'v0.1.0', 'first release was: v0.1.0');
});

test('Fetch latest release', async t => {
  const [[expected], actual] = await Promise.all([
    client.listReleases(),
    client.fetchRelease('latest')
  ]);
  t.plan(2);
  t.deepEqual(expected, actual, `latest release: ${expected.tag}`);
  const filenames = values(pkg.config.artifacts);
  t.deepEqual(Array.from(actual.files.keys()).sort(), filenames.sort(),
    `contains expected artifacts: ${filenames.join(', ')}`);
});

test('Download latest release (`linux`)', ...createDownloadTest(
  'linux',
  magic => magic.equals(Buffer.from('\x7FELF')),
  { timeout: ms('1m') }
));

test('Download latest release (`macOS`)', ...createDownloadTest(
  'darwin',
  magic => magic.equals(Buffer.from('\xCF\xFA\xED\xFE')),
  { timeout: ms('1m') }
));

test.only('Download latest release (`windows`)', ...createDownloadTest(
  'win32',
  magic => magic.slice(0, 2).equals(Buffer.from('MZ')),
  { timeout: ms('1m') }
));

function createDownloadTest(platform, predicate, options = {}) {
  return [options, async t => {
    let stream;
    try {
      stream = await client.download('latest', platform);
      stream.on('data', chunk => {
        chunk = chunk.slice(0, 4);
        stream.destroy();
        t.comment(`magic: ${formatBuffer(chunk)}`);
        t.assert(predicate(chunk), 'downloaded successfully');
        t.end();
      });
    } catch (err) {
      return t.end(err);
    }
  }];
}

function formatBuffer(buf) {
  return Array.from(buf).map(it => it.toString(16).padStart(2, 0)).join(' ');
}
