import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectService } from '../../src/main/services/project-service.js';

const roots: string[] = [];
const mockedUserDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-user-data-'));

vi.mock('electron', () => ({
  app: {
    getPath: () => mockedUserDataRoot,
    getAppPath: () => process.cwd()
  }
}));

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('ProjectService template bootstrap', () => {
  it('creates project content from template stage documents instead of fixed software-factory directories', () => {
    const locationPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-template-bootstrap-'));
    roots.push(locationPath);

    const service = new ProjectService();
    const project = service.createProject({
      name: 'office-hours-project',
      locationPath,
      directoryMode: 'create-in-parent',
      templateId: 'gstack-office-hours'
    });

    const rootPath = project.rootPath;
    const discoverPath = path.join(rootPath, '01-office-hours', '01-demand-reality.md');

    expect(fs.existsSync(discoverPath)).toBe(true);
    expect(fs.readFileSync(discoverPath, 'utf8')).toContain('# Demand Reality');
    expect(fs.existsSync(path.join(rootPath, '01-requirements'))).toBe(false);
    expect(fs.existsSync(path.join(rootPath, '.project', 'manifest.json'))).toBe(true);
  });

  it('materializes execution bindings onto default software-factory flow nodes during project creation', () => {
    const locationPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-software-factory-bootstrap-'));
    roots.push(locationPath);

    const service = new ProjectService();
    const project = service.createProject({
      name: 'software-factory-project',
      locationPath,
      directoryMode: 'create-in-parent',
      templateId: 'software-factory'
    });

    const assets = service.loadPlatformAssets(project.rootPath);
    const mainFlow = assets.flows.find((item) => item.id === 'sf-flow-main');
    const reviewSubflow = assets.subflows.find((item) => item.id === 'sf-subflow-review');

    expect(mainFlow).toBeTruthy();
    expect(reviewSubflow).toBeTruthy();

    const mainAgentBindings = (mainFlow?.nodes ?? [])
      .filter((node) => node.type === 'agent')
      .map((node) => ({
        id: node.id,
        taskTemplateId: node.data.taskTemplateId ?? null,
        agentProfileId: node.data.agentProfileId ?? null
      }));
    const reviewAgentBindings = (reviewSubflow?.nodes ?? [])
      .filter((node) => node.type === 'agent')
      .map((node) => ({
        id: node.id,
        taskTemplateId: node.data.taskTemplateId ?? null,
        agentProfileId: node.data.agentProfileId ?? null
      }));

    expect(mainAgentBindings).toEqual([
      { id: 'sf-main-discover', taskTemplateId: 'sf-task-discover', agentProfileId: 'sf-agent-discover' },
      { id: 'sf-main-plan', taskTemplateId: 'sf-task-plan', agentProfileId: 'sf-agent-plan' }
    ]);
    expect(reviewAgentBindings).toEqual([
      { id: 'sf-review-blue', taskTemplateId: 'sf-task-review-blue', agentProfileId: 'sf-agent-review-blue' },
      { id: 'sf-review-red', taskTemplateId: 'sf-task-review-red', agentProfileId: 'sf-agent-review-red' },
      { id: 'sf-review-judge', taskTemplateId: 'sf-task-review-judge', agentProfileId: 'sf-agent-review-judge' }
    ]);
  });
});
