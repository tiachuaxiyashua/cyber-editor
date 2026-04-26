import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CapabilityRuntime } from '../../src/main/services/capability-runtime.js';
import { EvidenceStoreService } from '../../src/main/services/evidence-store-service.js';

const roots: string[] = [];
const lookupMock = vi.hoisted(() => vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]));

const mockTitle = vi.fn(async () => 'Example Domain');
const mockUrl = vi.fn(() => 'https://example.com/');
const mockGoto = vi.fn(async () => ({ ok: () => true, status: () => 200, statusText: () => 'OK' }));
const mockCloseBrowser = vi.fn(async () => undefined);
const mockMainTextContent = vi.fn(async () => 'Example Domain Example content for research.');
const mockBodyTextContent = vi.fn(async () => 'Fallback body content for research.');
const mockLinks = vi.fn(async () => [
  { href: 'https://example.com/docs', text: 'Docs' },
  { href: 'https://example.com/about', text: 'About' }
]);

const mockLocator = vi.fn((selector: string) => ({
  first: () => ({
    textContent: selector === 'body' ? mockBodyTextContent : mockMainTextContent
  })
}));

vi.mock('node:dns/promises', () => ({
  lookup: lookupMock
}));

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(async () => ({
      newPage: vi.fn(async () => ({
        goto: mockGoto,
        title: mockTitle,
        url: mockUrl,
        locator: mockLocator,
        $$eval: mockLinks
      })),
      close: mockCloseBrowser
    }))
  }
}));

function createRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  fs.mkdirSync(path.join(root, '.project'), { recursive: true });
  return root;
}

function createContext(approvalId?: string) {
  const events: any[] = [];
  return {
    events,
    value: {
      runId: 'run-test',
      approvalId,
      emit: (event: any) => {
        events.push(event);
      }
    }
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('CapabilityRuntime headless browser capability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockGoto.mockResolvedValue({ ok: () => true, status: () => 200, statusText: () => 'OK' });
    mockTitle.mockResolvedValue('Example Domain');
    mockUrl.mockReturnValue('https://example.com/');
    mockMainTextContent.mockResolvedValue('Example Domain Example content for research.');
    mockBodyTextContent.mockResolvedValue('Fallback body content for research.');
    mockLinks.mockResolvedValue([
      { href: 'https://example.com/docs', text: 'Docs' },
      { href: 'https://example.com/about', text: 'About' }
    ]);
  });

  it('lists and executes the public headless browser capability with structured evidence and logs', async () => {
    const rootPath = createRoot('cyber-editor-browser-capability-');
    const evidenceStore = new EvidenceStoreService();
    const projectService = {
      resolveProjectPath: (_rootPath: string, relativePath: string) => path.join(rootPath, relativePath),
      readFile: vi.fn(() => '# doc'),
      saveFile: vi.fn(),
      listMarkdownFiles: vi.fn(() => []),
      searchProjectContent: vi.fn(() => []),
      appendAudit: vi.fn()
    };
    const platformService = {
      loadAssets: vi.fn(() => ({ connectors: [], tools: [] })),
      runTool: vi.fn(),
      testConnector: vi.fn()
    };
    const runtime = new CapabilityRuntime(projectService as never, platformService as never, evidenceStore);
    const context = createContext();

    expect(runtime.listCapabilities(rootPath).some((item) => item.id === 'network:headless_browser')).toBe(true);

    const result = await runtime.execute(
      rootPath,
      'browse_web',
      { url: 'https://example.com', selector: 'main', maxTextLength: 120, timeoutMs: 12000 },
      context.value
    ) as any;

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.title).toBe('Example Domain');
    expect(result.text).toContain('Example content for research');
    expect(result.links).toHaveLength(2);
    expect(result.evidenceId).toBeTruthy();
    expect(result.timeout).toMatchObject({ requestedMs: 12000, appliedMs: 12000 });
    expect(result.selectorResolution).toMatchObject({
      requestedSelector: 'main',
      usedSelector: 'main',
      usedFallback: false
    });
    expect(result.truncation).toMatchObject({
      requestedMaxLength: 120,
      appliedMaxLength: 500,
      sourceTextLength: 44,
      returnedTextLength: 44,
      truncated: false
    });
    expect(Array.isArray(result.logs)).toBe(true);
    expect(result.logs.some((entry: any) => entry.phase === 'navigate')).toBe(true);
    expect(context.events.some((event) => event.type === 'tool.completed')).toBe(true);

    const evidence = evidenceStore.readCapabilityExecution(rootPath, result.evidenceId);
    expect(evidence?.capabilityId).toBe('network:headless_browser');
    expect(evidence?.status).toBe('completed');
    expect(evidence?.response).toMatchObject({
      status: 200,
      statusText: 'OK',
      title: 'Example Domain',
      linkCount: 2
    });
    expect(evidence?.logs.some((entry) => entry.phase === 'extract')).toBe(true);
  });

  it('falls back to body extraction and records truncation metadata', async () => {
    const rootPath = createRoot('cyber-editor-browser-capability-');
    const evidenceStore = new EvidenceStoreService();
    const projectService = {
      resolveProjectPath: (_rootPath: string, relativePath: string) => path.join(rootPath, relativePath),
      readFile: vi.fn(() => '# doc'),
      saveFile: vi.fn(),
      listMarkdownFiles: vi.fn(() => []),
      searchProjectContent: vi.fn(() => []),
      appendAudit: vi.fn()
    };
    const platformService = {
      loadAssets: vi.fn(() => ({ connectors: [], tools: [] })),
      runTool: vi.fn(),
      testConnector: vi.fn()
    };
    mockMainTextContent.mockRejectedValueOnce(new Error('selector timeout'));
    mockBodyTextContent.mockResolvedValue('X'.repeat(900));
    const runtime = new CapabilityRuntime(projectService as never, platformService as never, evidenceStore);
    const context = createContext();

    const result = await runtime.execute(
      rootPath,
      'network:headless_browser',
      { url: 'https://example.com', selector: 'main', maxTextLength: 700, timeoutMs: 9000 },
      context.value
    ) as any;

    expect(result.selectorResolution).toMatchObject({
      requestedSelector: 'main',
      usedSelector: 'body',
      usedFallback: true
    });
    expect(result.truncation).toMatchObject({
      requestedMaxLength: 700,
      appliedMaxLength: 700,
      sourceTextLength: 900,
      returnedTextLength: 700,
      truncated: true
    });
    const evidence = evidenceStore.readCapabilityExecution(rootPath, result.evidenceId);
    expect(evidence?.selector).toMatchObject({
      requestedSelector: 'main',
      usedSelector: 'body',
      usedFallback: true
    });
    expect(evidence?.truncation).toMatchObject({
      sourceTextLength: 900,
      returnedTextLength: 700,
      truncated: true
    });
  });

  it('persists classified timeout failures with user-facing hints', async () => {
    const rootPath = createRoot('cyber-editor-browser-capability-');
    const evidenceStore = new EvidenceStoreService();
    const projectService = {
      resolveProjectPath: (_rootPath: string, relativePath: string) => path.join(rootPath, relativePath),
      readFile: vi.fn(() => '# doc'),
      saveFile: vi.fn(),
      listMarkdownFiles: vi.fn(() => []),
      searchProjectContent: vi.fn(() => []),
      appendAudit: vi.fn()
    };
    const platformService = {
      loadAssets: vi.fn(() => ({ connectors: [], tools: [] })),
      runTool: vi.fn(),
      testConnector: vi.fn()
    };
    mockGoto.mockRejectedValue(new Error('page.goto: Timeout 15000ms exceeded while loading https://example.com'));
    const runtime = new CapabilityRuntime(projectService as never, platformService as never, evidenceStore);
    const context = createContext();

    await expect(
      runtime.execute(rootPath, 'network:headless_browser', { url: 'https://example.com', timeoutMs: 15000 }, context.value)
    ).rejects.toMatchObject({ code: 'network_error' });

    expect(context.events.some((event) => event.type === 'tool.failed')).toBe(true);
    const entries = evidenceStore.listEntries(rootPath, 'capabilities');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe('failed');
    const evidence = evidenceStore.readCapabilityExecution(rootPath, entries[0]!.id);
    expect(evidence?.status).toBe('failed');
    expect(evidence?.failure).toMatchObject({
      classification: 'navigation_timeout',
      code: 'network_error',
      retryable: true
    });
    expect(evidence?.failure?.hint).toContain('timeout');
    expect(evidence?.logs.some((entry) => entry.level === 'error')).toBe(true);
  });

  it('blocks loopback targets for the headless browser capability', async () => {
    const rootPath = createRoot('cyber-editor-browser-capability-');
    const evidenceStore = new EvidenceStoreService();
    const projectService = {
      resolveProjectPath: (_rootPath: string, relativePath: string) => path.join(rootPath, relativePath),
      readFile: vi.fn(() => '# doc'),
      saveFile: vi.fn(),
      listMarkdownFiles: vi.fn(() => []),
      searchProjectContent: vi.fn(() => []),
      appendAudit: vi.fn()
    };
    const platformService = {
      loadAssets: vi.fn(() => ({ connectors: [], tools: [] })),
      runTool: vi.fn(),
      testConnector: vi.fn()
    };
    const runtime = new CapabilityRuntime(projectService as never, platformService as never, evidenceStore);
    const context = createContext();

    await expect(
      runtime.execute(rootPath, 'network:headless_browser', { url: 'http://127.0.0.1:3000/health' }, context.value)
    ).rejects.toMatchObject({ code: 'permission_error' });
  });
});
