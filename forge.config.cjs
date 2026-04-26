'use strict';

const { MakerZIP } = require('@electron-forge/maker-zip');
const { VitePlugin } = require('@electron-forge/plugin-vite');

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
const config = {
  packagerConfig: {
    asar: true
  },
  makers: [
    new MakerZIP({}, ['darwin', 'win32'])
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts'
        },
        {
          entry: 'src/main/preload.ts',
          config: 'vite.preload.config.ts'
        }
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts'
        }
      ]
    })
  ]
};

module.exports = config;
