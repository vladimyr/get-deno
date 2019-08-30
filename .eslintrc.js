'use strict';

const config = require('@vladimyr/eslint-config');
const [esmConfig] = config.overrides;


module.exports = {
  extends: '@vladimyr',
  overrides: [{
    ...esmConfig,
    files: ['rollup.config.js']
  }]
};
