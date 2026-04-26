"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
exports.default = (0, test_1.defineConfig)({
    testDir: './tests/e2e',
    testMatch: '**/*.spec.ts',
    timeout: 60_000,
    workers: 1,
    reporter: 'list',
    use: {
        trace: 'on-first-retry'
    }
});
