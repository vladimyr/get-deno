'use strict';

const { promisify } = require('util');
const { createWriteStream, renameSync } = require('fs');
const { download, listReleases, InstallationError } = require('./');
const debug = require('debug')('cli');
const Gauge = require('gauge');
const kleur = require('kleur');
const makeDir = require('make-dir');
const miss = require('mississippi');
const os = require('os');
const path = require('path');
const pkg = require('./package.json');
const prettyBytes = require('pretty-bytes');
const semver = require('semver');
const spinner = require('ora')();

kleur.enabled = Boolean(process.stdout.isTTY);

// NOTE: Copied from bili (by @egoist): https://git.io/fxupU
const supportsEmoji = process.platform !== 'win32' ||
                      process.env.TERM === 'xterm-256color';

const isWindows = () => /^win/i.test(os.platform());
const formatDate = str => str.split('T')[0];
const formatError = msg => msg.replace(/^\w*Error:\s+/, match => kleur.red().bold(match));
const pipe = promisify(miss.pipe);

const options = require('minimist-options')({
  help: { type: 'boolean', alias: 'h' },
  version: { type: 'boolean', alias: 'v' },
  'list-releases': { type: 'boolean', alias: 'l' }
});
options.unknown = option => fail(`Error: Unknown option \`${option}\``, -1);
const argv = require('minimist')(process.argv.slice(2), options);

const help = `
  ${kleur.bold(pkg.name)} v${pkg.version}

  Usage:
    $ ${pkg.name} [version]  # install specified version, defaults to latest

  Options:
    -l, --list-releases  List deno releases
    -h, --help           Show help
    -v, --version        Show version number

  Homepage:     ${kleur.green(pkg.homepage)}
  Report issue: ${kleur.green(pkg.bugs.url)}
`;

program(argv._, argv).catch(err => {
  spinner.stop().clear();
  console.error(formatError(err.stack));
});

async function program([input], flags) {
  if (flags.version) return console.log(pkg.version);
  if (flags.help) return console.log(help);
  input = input && `${input}`;
  if (flags['list-releases']) {
    const range = semver.validRange(input) || '*';
    debug('list releases inside range=`%s`', range);
    return printReleases(range);
  }
  let version = semver.valid(semver.coerce(input));
  if (input && !version) {
    fail('Error: Invalid version provided.', 2);
  }
  version = version ? `v${version}` : 'latest';
  debug('install version `%s`', version);
  try {
    await install(version);
  } catch (err) {
    if (!(err instanceof InstallationError)) throw err;
    fail(`Error: ${err.message}`);
  }
}

async function install(version) {
  const gauge = new Gauge();
  spinner.start(`Querying ${kleur.bold(pkg.config.repo)} for version: ${kleur.cyan(version)}...`);

  const dest = await makeDir(path.join(os.homedir(), '/.deno/bin/'));
  const stream = await download(version);
  stream.on('download:progress', (value, downloaded, total) => {
    const stats = `${prettyBytes(downloaded)}/${kleur.bold(prettyBytes(total))}`;
    gauge.show(stats, value);
    gauge.pulse();
  });

  version = stream.metadata.version.replace(/^v/, '');
  spinner.text = `Downloading ${kleur.bold().cyan(`deno@${version}`)} from ${kleur.gray(stream.metadata.url)}`;
  spinner.stopAndPersist({ symbol: supportsEmoji && '📦 ' });

  const binary = path.join(dest, isWindows() ? 'deno.exe' : 'deno');
  await pipe(stream, createWriteStream(`${binary}.download`, { mode: 744 }));
  gauge.hide();
  clearSpinner(spinner);

  renameSync(`${binary}.download`, binary);
  spinner.succeed(`${kleur.bold().cyan(`deno@${version}`)} is successfully installed!`);
}

async function printReleases(range) {
  spinner.start(`Querying ${kleur.bold(pkg.config.repo)} for available releases...`);
  const releases = await listReleases();
  if (!releases || releases.length <= 0) {
    fail('Error: No releases found.', 3);
  }
  const matches = releases.reduce((acc, it) => {
    const version = semver.coerce(it.tag);
    if (!semver.satisfies(version, range)) return acc;
    acc.push([it.tag.padEnd(10), kleur.gray(formatDate(it.publishedAt))].join(''));
    return acc;
  }, []);
  if (matches.length <= 0) {
    fail('Error: There are no releases satisfying given range.', 4);
  }
  spinner.stop().clear();
  console.log(matches.join('\n'));
}

function fail(message, code = 1) {
  message = formatError(message);
  if (spinner.isSpinning) spinner.fail(message);
  else console.error(message);
  process.exit(code);
}

function clearSpinner(spinner) {
  let line = 0;
  while (line < spinner.lineCount) {
    spinner.stream.moveCursor(0, -1);
    spinner.stream.clearLine();
    spinner.stream.cursorTo(0);
    line += 1;
  }
}
