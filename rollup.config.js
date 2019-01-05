import { builtinModules } from 'module';
import commonjs from 'rollup-plugin-commonjs';
import json from 'rollup-plugin-json';
import path from 'path';
import postprocess from 'rollup-plugin-postprocess';
import replace from 'rollup-plugin-re';
import resolve from 'rollup-plugin-node-resolve';
import visualizer from 'rollup-plugin-visualizer';

const external = builtinModules.concat('readable-stream');
const sourceMap = true;

export default {
  input: 'cli.js',
  output: {
    file: 'cli.compact.js',
    format: 'cjs',
    banner: '#!/usr/bin/env node',
    sourcemap: sourceMap
  },
  external,
  plugins: [
    replace({
      patterns: [{
        test: /require\('debug'\)/g,
        replace: `require('debug/src/node')`
      }]
    }),
    resolve(),
    commonjs({
      sourceMap,
      ignore(id) {
        return /package\.json/.test(id) &&
          path.resolve(id) === path.resolve(__dirname, './package.json');
      }
    }),
    json(),
    postprocess([
      [/require\('readable-stream'\)/, `require('stream')`]
    ]),
    visualizer()
  ]
};
