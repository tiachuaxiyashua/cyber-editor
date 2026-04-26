"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config = {
    build: {
        outDir: '.vite/build',
        emptyOutDir: false,
        sourcemap: true,
        lib: {
            entry: 'src/main/preload.ts',
            formats: ['cjs'],
            fileName: () => 'preload.js'
        },
        rollupOptions: {
            external: [/^node:/, 'electron', 'electron/main', 'electron/common', 'electron/renderer']
        }
    }
};
exports.default = config;
