"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config = {
    build: {
        outDir: '.vite/build',
        emptyOutDir: false,
        sourcemap: true,
        lib: {
            entry: 'src/main/main.ts',
            formats: ['cjs'],
            fileName: () => 'main.js'
        },
        rollupOptions: {
            external: [/^node:/, 'electron', 'electron/main', 'electron/common', 'electron/renderer']
        }
    }
};
exports.default = config;
