import alias from '@rollup/plugin-alias';
import { builtinModules } from 'module';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import replace from '@rollup/plugin-replace';
import resolve from '@rollup/plugin-node-resolve';
import visualizer from 'rollup-plugin-visualizer';

const sourceMap = true;

/** @type {import('rollup').RollupOptions} */
const config = {
  input: 'cli.js',
  output: {
    file: 'cli.compact.js',
    format: 'cjs',
    banner: '#!/usr/bin/env node',
    sourcemap: sourceMap
  },
  external: builtinModules,
  plugins: [
    alias({
      debug: 'debug/src/node'
    }),
    replace({
      "process.env.READABLE_STREAM === 'disable' && Stream": JSON.stringify(true)
    }),
    resolve(),
    commonjs({ sourceMap }),
    json(),
    visualizer()
  ]
};

export default config;
