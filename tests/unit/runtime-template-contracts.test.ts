import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTemplatePackage } from '../../src/shared/template-package.js';
import { normalizeRuntimeTemplate, resolveRuntimeExportMapping } from '../../src/shared/runtime-template.js';
import type { RuntimeTemplateAsset } from '../../src/shared/types.js';
import {
  buildConsistencyRequiredPaths,
  collectOpenSpecSourceDocuments,
  resolveOpenSpecWorkspaceRoot
} from '../../src/main/services/runtime-template-contracts.js';

function loadTemplate(fileName: string): RuntimeTemplateAsset {
  const raw = fs.readFileSync(path.join(process.cwd(), 'src', 'shared', 'template-packages', fileName), 'utf8');
  return normalizeRuntimeTemplate(parseTemplatePackage(raw).runtime.template);
}

describe('runtime template contract helpers', () => {
  it('resolves software-factory consistency and handoff inputs from template contracts', () => {
    const rootPath = 'E:/tmp/software-factory';
    const template = loadTemplate('software-factory.json');

    const requiredPaths = buildConsistencyRequiredPaths(rootPath, template, {
      stage: 'plan',
      confirmedStages: ['discover', 'clarify']
    });
    const handoffDocs = collectOpenSpecSourceDocuments(template, {
      confirmedStages: ['discover', 'clarify', 'plan']
    });

    expect(requiredPaths).toContain(path.join(rootPath, '01-requirements', '03-功能树.md'));
    expect(requiredPaths).toContain(path.join(rootPath, '02-solution', '01-技术方案.md'));
    expect(handoffDocs.some((document) => document.path === '01-requirements/03-功能树.md')).toBe(true);
    expect(handoffDocs.some((document) => document.path === '02-solution/01-技术方案.md')).toBe(true);
    expect(resolveOpenSpecWorkspaceRoot(template)).toBe('03-openspec');
  });

  it('resolves gstack stage artifacts without falling back to software-factory directories', () => {
    const rootPath = 'E:/tmp/gstack';
    const template = loadTemplate('gstack-office-hours.json');

    const requiredPaths = buildConsistencyRequiredPaths(rootPath, template, {
      stage: 'plan',
      confirmedStages: ['discover', 'clarify']
    });
    const handoffDocs = collectOpenSpecSourceDocuments(template, {
      confirmedStages: ['discover', 'clarify', 'plan']
    });

    expect(requiredPaths).toContain(path.join(rootPath, '01-office-hours', '04-narrowest-wedge.md'));
    expect(requiredPaths.some((entry) => entry.includes('01-requirements'))).toBe(false);
    expect(handoffDocs).toEqual([]);
  });

  it('derives the OpenSpec workspace root from custom export mapping parents', () => {
    const template = loadTemplate('software-factory.json');
    const exportMapping = resolveRuntimeExportMapping(template);
    template.exportMapping = {
      ...exportMapping,
      openspec: {
        enabled: true,
        artifactPaths: ['02-solution/01-技术方案.md'],
        outputPathPattern: 'handoff/openspec/exports',
        fileNamePattern: 'package',
        transformProfile: 'openspec'
      }
    };

    expect(resolveOpenSpecWorkspaceRoot(template)).toBe('handoff/openspec');
  });
});
