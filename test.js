'use strict';

const { Writable } = require('stream');
const client = require('./');
const pkg = require('./package.json');
const test = require('tape');

const values = obj => Object.keys(obj).map(it => obj[it]);

class Sink extends Writable {
  _write(_, __, callback) {
    callback();
  }
  _writev(_, callback) {
    callback();
  }
}

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

test('Download latest release (`linux`)', createDownloadTest('linux'));
test('Download latest release (`macOS`)', createDownloadTest('darwin'));
test('Download latest release (`windows`)', createDownloadTest('win32'));

function createDownloadTest(platform) {
  return async t => {
    let stream;
    try {
      stream = await client.download('latest', platform);
    } catch (err) {
      return t.end(err);
    }
    stream
      .once('error', err => t.end(err))
      .once('finish', () => {
        t.pass('downloaded successfully');
        t.end();
      })
      .pipe(new Sink());
  };
}
