import { describe, expect, it, vi } from 'vitest';
import { ProjectService } from '../../src/main/services/project-service.js';
import { RuntimeService } from '../../src/main/services/runtime-service.js';

describe('service boundary ownership', () => {
  it('delegates document change context building to DocumentChangeService', () => {
    const documentChangeService = {
      listRecentDocumentChanges: vi.fn(() => []),
      recordDocumentChange: vi.fn(() => null),
      getRelevantDocumentChanges: vi.fn(() => []),
      buildRecentChangeContext: vi.fn(() => 'recent-context'),
      buildDocumentContext: vi.fn(() => 'document-context')
    };

    const service = new ProjectService({} as never, {} as never, documentChangeService as never);

    expect(service.buildRecentChangeContext('E:/project', ['a.md'])).toBe('recent-context');
    expect(service.buildDocumentContext('E:/project', ['a.md'])).toBe('document-context');
    expect(documentChangeService.buildRecentChangeContext).toHaveBeenCalledWith('E:/project', ['a.md'], 4);
    expect(documentChangeService.buildDocumentContext).toHaveBeenCalledWith('E:/project', ['a.md'], 800);
  });

  it('delegates template authoring to TemplateAuthoringService', () => {
    const templateAuthoringService = {
      buildTemplatePackage: vi.fn(() => ({ definition: { id: 'template-1' } })),
      saveRuntimeTemplate: vi.fn(() => ({ template: { id: 'template-1' }, issues: [] }))
    };

    const service = new RuntimeService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      templateAuthoringService as never
    );

    vi.spyOn(service, 'ensureProjectRuntime').mockImplementation(() => undefined);

    service.buildTemplatePackage('E:/project', {} as never);
    service.saveRuntimeTemplate('E:/project', { id: 'template-1' } as never);

    expect(templateAuthoringService.buildTemplatePackage).toHaveBeenCalledWith('E:/project', expect.anything());
    expect(templateAuthoringService.saveRuntimeTemplate).toHaveBeenCalledWith('E:/project', expect.objectContaining({ id: 'template-1' }));
  });
});
