import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';

export default {
  packagerConfig: {
    asar: {
      // `node-pty` loads native binaries and helper executables from prebuilds.
      // Keep this directory outside app.asar so the native module can load/run.
      unpackDir: 'node_modules/node-pty',
    },
    // The Vite plugin's default ignore filter keeps only `/.vite`, which drops
    // externalized runtime dependencies like `node-pty`.
    ignore: (file) => {
      if (!file) return false;
      return !(
        file === '/.vite' ||
        file.startsWith('/.vite/') ||
        file === '/node_modules' ||
        file === '/node_modules/node-pty' ||
        file.startsWith('/node_modules/node-pty/') ||
        file === '/node_modules/node-addon-api' ||
        file.startsWith('/node_modules/node-addon-api/')
      );
    },
  },
  rebuildConfig: {
    onlyModules: ['node-pty'],
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
    },
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        authors: 'OnlySpecs',
        description: 'Multi-editor Electron app with Monaco Editor',
      },
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          maintainer: 'OnlySpecs',
          homepage: 'https://github.com/yourusername/only-specs',
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          homepage: 'https://github.com/yourusername/only-specs',
        },
      },
    },
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.mjs',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.mjs',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.mjs',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
    }),
  ],
};
