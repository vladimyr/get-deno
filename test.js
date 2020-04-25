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
  const fileGroups = values(pkg.config.artifacts);
  const actualFiles = new Set(actual.files.keys());
  const expectedFiles = new Set();
  t.ok(
    fileGroups.every(group => group.some(file => {
      return actualFiles.has(file) && expectedFiles.add(file);
    })),
    `contains expected artifacts: ${Array.from(expectedFiles).join(', ')}`
  );
});

test('Download latest release (`linux`)', ...createDownloadTest(
  'linux',
  magic => magic.equals(Buffer.from('\x7FELF'))
));

test('Download latest release (`macOS`)', ...createDownloadTest(
  'darwin',
  magic => magic.equals(Buffer.from('CFFAEDFE', 'hex'))
));

test('Download latest release (`windows`)', ...createDownloadTest(
  'win32',
  magic => magic.slice(0, 2).equals(Buffer.from('MZ'))
));

function createDownloadTest(platform, predicate, options = {}) {
  options.timeout = options.timeout || ms('1m');
  return [options, async t => {
    const stream = await client.download('latest', platform);
    const magic = await readChunk(stream, { length: 4 });
    t.comment(`magic: ${formatBuffer(magic)}`);
    t.assert(predicate(magic), 'downloaded successfully');
  }];
}

function readChunk(stream, { length }) {
  return new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.on('data', chunk => {
      const data = chunk.slice(0, length);
      stream.destroy();
      resolve(data);
    });
  });
}

function formatBuffer(buf) {
  return Array.from(buf).map(it => it.toString(16).padStart(2, 0)).join(' ');
}
