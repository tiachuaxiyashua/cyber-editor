"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const plugin_react_1 = __importDefault(require("@vitejs/plugin-react"));
function rendererManualChunks(id) {
    const normalized = id.replace(/\\/g, '/');
    if (!normalized.includes('/node_modules/')) {
        return undefined;
    }
    if (normalized.includes('/@xyflow/react/')) {
        return 'orchestration-vendor';
    }
    if (normalized.includes('/mermaid/dist/chunks/mermaid.core') ||
        normalized.includes('/mermaid/dist/mermaid.core.mjs')) {
        return 'diagram-core-vendor';
    }
    if (normalized.includes('/mermaid/')) {
        return 'diagram-vendor';
    }
    if (normalized.includes('/@mermaid-js/') ||
        normalized.includes('/chevrotain/') ||
        normalized.includes('/@chevrotain/') ||
        normalized.includes('/langium/') ||
        normalized.includes('/vscode-languageserver-protocol/') ||
        normalized.includes('/vscode-jsonrpc/') ||
        normalized.includes('/khroma/')) {
        return 'diagram-parser-vendor';
    }
    if (/\/d3-[^/]+\//.test(normalized) ||
        normalized.includes('/dagre-d3-es/') ||
        normalized.includes('/dagre/') ||
        normalized.includes('/cytoscape/')) {
        return 'diagram-layout-vendor';
    }
    if (normalized.includes('/react-markdown/') ||
        normalized.includes('/remark-gfm/') ||
        normalized.includes('/mdast-util-') ||
        normalized.includes('/micromark') ||
        normalized.includes('/hast-util-') ||
        normalized.includes('/property-information/') ||
        normalized.includes('/vfile/') ||
        normalized.includes('/unist-util-') ||
        normalized.includes('/decode-named-character-reference/') ||
        normalized.includes('/character-entities') ||
        normalized.includes('/trim-lines/') ||
        normalized.includes('/katex/')) {
        return 'document-vendor';
    }
    if (normalized.includes('/lodash-es/')) {
        return 'utility-vendor';
    }
    if (normalized.includes('/lucide-react/')) {
        return 'chrome-vendor';
    }
    if (normalized.includes('/react/') ||
        normalized.includes('/react-dom/') ||
        normalized.includes('/scheduler/')) {
        return 'react-vendor';
    }
    return undefined;
}
const config = {
    root: 'src/renderer',
    base: './',
    plugins: [(0, plugin_react_1.default)()],
    build: {
        sourcemap: true,
        outDir: '../../.vite/renderer/main_window',
        emptyOutDir: true,
        chunkSizeWarningLimit: 700,
        rollupOptions: {
            output: {
                manualChunks: rendererManualChunks
            }
        }
    }
};
exports.default = config;
