'use strict';

const client = require('./');
const miss = require('mississippi');
const ms = require('ms');
const pipe = require('util').promisify(miss.pipe);
const pkg = require('./package.json');
const test = require('tape');

const timeout = ms('5m');

const createSink = () => miss.to((_, __, cb) => cb());
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

test('Download latest release (`linux`)', { timeout }, createDownloadTest('linux'));
test('Download latest release (`macOS`)', { timeout }, createDownloadTest('darwin'));
test('Download latest release (`windows`)', { timeout }, createDownloadTest('win32'));

function createDownloadTest(platform) {
  return async t => {
    let stream;
    try {
      stream = await client.download('latest', platform);
      await pipe(stream, createSink());
      t.pass('downloaded successfully');
      t.end();
    } catch (err) {
      return t.end(err);
    }
  };
}
