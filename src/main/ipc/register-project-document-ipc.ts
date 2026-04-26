import fs from 'node:fs';
import { dialog, ipcMain, shell } from 'electron';
import type { BootstrapData, DocumentMeta, DocumentWriteResolutionInput, NoteReferenceComparison, ProjectCreateInput } from '../../shared/types';
import type { IpcRegistrationContext } from './context';

export function registerProjectDocumentIpc(context: IpcRegistrationContext) {
  const requireProjectPath = (targetPath: string) => {
    const rootPath = context.requireActiveRoot();
    return {
      rootPath,
      filePath: context.projectService.resolveProjectPath(rootPath, targetPath)
    };
  };

  const requireArtifactPath = (targetPath: string, sourcePath?: string) => {
    const rootPath = context.requireActiveRoot();
    const resolved = context.projectService.resolveArtifactPath(targetPath, sourcePath);
    return {
      rootPath,
      filePath: context.projectService.resolveProjectPath(rootPath, resolved)
    };
  };

  ipcMain.handle('bootstrap:load', (event): BootstrapData => {
    const windowContext = context.getWindowBootstrapContext(event.sender.id);
    const preferredProjectPath = windowContext.rootPath || context.settingsStore.getLastProjectPath();
    if (preferredProjectPath) {
      try {
        context.setActiveProjectRoot(preferredProjectPath);
        return context.buildBootstrap(preferredProjectPath);
      } catch (error) {
        context.appLogService.warn({
          source: 'ipc.project-document',
          event: 'bootstrap.load.fallback',
          message: 'Failed to restore the preferred project during bootstrap. Falling back to empty bootstrap.',
          metadata: {
            preferredProjectPath,
            webContentsId: event.sender.id
          },
          error
        });
        context.settingsStore.clearActiveProject();
        context.setActiveProjectRoot(null);
      }
    }
    return context.buildBootstrap(null);
  });

  ipcMain.handle('window:get-bootstrap-context', async (event) => context.getWindowBootstrapContext(event.sender.id));

  ipcMain.handle('window:open-document', async (event, filePath: string) => {
    const { rootPath, filePath: resolvedPath } = requireProjectPath(filePath);
    await context.openDocumentWindow({
      rootPath,
      filePath: resolvedPath,
      sourceWebContentsId: event.sender.id
    });
    return true;
  });

  ipcMain.handle('project:pick-directory', async () => context.projectService.pickProjectDirectory());

  ipcMain.handle('project:validate-create', async (_event, input: ProjectCreateInput) => {
    return context.projectService.validateProjectCreateInput(input);
  });

  ipcMain.handle('project:create', async (_event, input: ProjectCreateInput) => {
    const project = context.projectService.createProject(input);
    context.setActiveProjectRoot(project.rootPath);
    context.settingsStore.setActiveProject(project.rootPath, project.manifest.name, project.manifest.templateId);
    context.runtimeService.ensureProjectRuntime(project.rootPath);
    context.setProjectWorkbenchLayout();
    context.refreshMenu();
    return context.buildBootstrap(project.rootPath);
  });

  ipcMain.handle('project:open', async (_event, rootPath: string) => {
    const project = context.projectService.openProject(rootPath);
    context.setActiveProjectRoot(project.rootPath);
    context.settingsStore.setActiveProject(project.rootPath, project.manifest.name, project.manifest.templateId);
    context.runtimeService.ensureProjectRuntime(project.rootPath);
    context.setProjectWorkbenchLayout();
    context.refreshMenu();
    return context.buildBootstrap(project.rootPath);
  });

  ipcMain.handle('project:close', async () => {
    context.setActiveProjectRoot(null);
    context.settingsStore.clearActiveProject();
    context.refreshMenu();
    return context.buildBootstrap(null);
  });

  ipcMain.handle('project:refresh', async () => context.buildBootstrap(context.getActiveProjectRoot()));

  ipcMain.handle('project:set-active-document', async (_event, filePath?: string) => {
    const rootPath = context.requireActiveRoot();
    const workflow = context.projectService.loadWorkflow(rootPath);
    context.projectService.saveWorkflow(rootPath, {
      ...workflow,
      activeDocumentPath: filePath || undefined
    });
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('project:open-folder', async () => {
    const rootPath = context.getActiveProjectRoot();
    if (!rootPath) return false;
    return shell.openPath(rootPath);
  });

  ipcMain.handle('project:create-file', async (_event, parentPath: string, name: string) => {
    const rootPath = context.requireActiveRoot();
    return context.projectService.createFile(rootPath, parentPath, name, '# 新文档\n');
  });

  ipcMain.handle('project:create-directory', async (_event, parentPath: string, name: string) => {
    const rootPath = context.requireActiveRoot();
    return context.projectService.createDirectory(rootPath, parentPath, name);
  });

  ipcMain.handle('project:rename-entry', async (_event, targetPath: string, nextName: string) => {
    const rootPath = context.requireActiveRoot();
    return context.projectService.renameEntry(rootPath, targetPath, nextName);
  });

  ipcMain.handle('project:move-entry', async (_event, targetPath: string, destinationDirectoryPath: string) => {
    const rootPath = context.requireActiveRoot();
    return context.projectService.moveEntry(rootPath, targetPath, destinationDirectoryPath);
  });

  ipcMain.handle('project:delete-entry', async (_event, targetPath: string) => {
    const rootPath = context.requireActiveRoot();
    context.projectService.deleteEntry(rootPath, targetPath);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('project:import-documents', async (_event, parentPath: string) => {
    const rootPath = context.requireActiveRoot();
    const result = await dialog.showOpenDialog(context.getMainWindow(), {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Markdown / 文本文档', extensions: ['md', 'markdown', 'txt'] }]
    });
    if (result.canceled || !result.filePaths.length) {
      return [];
    }
    return context.projectService.importTextFiles(rootPath, parentPath, result.filePaths);
  });

  ipcMain.handle('project:restore-snapshot', async (_event, snapshotId: string) => {
    const rootPath = context.requireActiveRoot();
    context.projectService.restoreSnapshot(rootPath, snapshotId);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('document:read', async (_event, filePath: string) => {
    return context.projectService.readFile(requireProjectPath(filePath).filePath);
  });
  ipcMain.handle('document:meta', async (_event, filePath: string) => {
    return context.projectService.getDocumentMeta(requireProjectPath(filePath).filePath);
  });
  ipcMain.handle('artifact:open', async (_event, payload: { targetPath: string; sourcePath?: string }) => {
    const { filePath } = requireArtifactPath(payload.targetPath, payload.sourcePath);
    return context.projectService.openArtifact(filePath);
  });
  ipcMain.handle('artifact:save', async (_event, payload: { filePath: string; artifact: import('../../shared/types').ArtifactOpenPayload }) => {
    const { filePath } = requireProjectPath(payload.filePath);
    const artifact = await context.projectService.saveArtifact(filePath, payload.artifact);
    return {
      artifact,
      bootstrap: context.getActiveProjectRoot() ? context.buildBootstrap(context.getActiveProjectRoot()) : null
    };
  });
  ipcMain.handle('document:list-snapshots', async (_event, filePath: string) => {
    const rootPath = context.requireActiveRoot();
    return context.projectService.listDocumentSnapshots(rootPath, filePath);
  });
  ipcMain.handle('document:create-snapshot', async (_event, filePath: string, label?: string) => {
    const rootPath = context.requireActiveRoot();
    context.projectService.createDocumentSnapshot(rootPath, filePath, label);
    return context.buildBootstrap(rootPath);
  });
  ipcMain.handle('document:restore-snapshot', async (_event, filePath: string, snapshotId: string) => {
    const rootPath = context.requireActiveRoot();
    context.projectService.restoreDocumentSnapshot(rootPath, filePath, snapshotId);
    return context.buildBootstrap(rootPath);
  });
  ipcMain.handle('document:list-pending-writes', async (_event, filePath?: string) => {
    const rootPath = context.requireActiveRoot();
    return context.projectService.listPendingDocumentWrites(rootPath, filePath);
  });
  ipcMain.handle('document:resolve-pending-write', async (_event, proposalId: string, input: DocumentWriteResolutionInput) => {
    const rootPath = context.requireActiveRoot();
    const result = context.runtimeService.resolvePendingDocumentWrite(rootPath, proposalId, input);
    return {
      bootstrap: context.buildBootstrap(rootPath),
      result
    };
  });
  ipcMain.handle('document:save', async (_event, filePath: string, contents: string) => {
    context.projectService.saveFile(requireProjectPath(filePath).filePath, contents, { source: 'editor-save' });
    return context.getActiveProjectRoot() ? context.buildBootstrap(context.getActiveProjectRoot()) : null;
  });
  ipcMain.handle('document:record-external-change', async (_event, filePath: string, previousContents: string, nextContents: string) => {
    context.projectService.recordDocumentChange(
      requireProjectPath(filePath).filePath,
      previousContents,
      nextContents,
      'external-change'
    );
    return context.getActiveProjectRoot() ? context.buildBootstrap(context.getActiveProjectRoot()) : null;
  });
  ipcMain.handle('document:watch', async (event, filePath: string) => {
    const { filePath: resolvedPath } = requireProjectPath(filePath);
    context.clearDocumentWatcher(event.sender.id);
    const watcher = fs.watch(resolvedPath, () => {
      const existingTimer = context.documentWatchTimers.get(event.sender.id);
      if (existingTimer) clearTimeout(existingTimer);
      const nextTimer = setTimeout(() => {
        try {
          const meta: DocumentMeta = context.projectService.getDocumentMeta(resolvedPath);
          event.sender.send('document:changed', meta);
        } catch {
          // ignore transient watcher errors
        }
      }, 120);
      context.documentWatchTimers.set(event.sender.id, nextTimer);
    });
    context.documentWatchers.set(event.sender.id, watcher);
    return true;
  });
  ipcMain.handle('document:unwatch', async (event) => {
    context.clearDocumentWatcher(event.sender.id);
    return true;
  });
  ipcMain.handle('document:import-image', async (_event, documentPath: string, payload: { fileName: string; base64: string }) => {
    const { rootPath, filePath } = requireProjectPath(documentPath);
    return context.projectService.importImageAsset(
      rootPath,
      filePath,
      payload.fileName,
      Buffer.from(payload.base64, 'base64')
    );
  });

  ipcMain.handle('search:project-content', async (_event, query: string) => {
    const rootPath = context.getActiveProjectRoot();
    if (!rootPath) return [];
    return context.projectService.searchProjectContent(rootPath, query);
  });
  ipcMain.handle('notes:compare-references', async (_event, basePath: string, comparePath: string): Promise<NoteReferenceComparison> => {
    const rootPath = context.requireActiveRoot();
    return context.projectService.compareNoteReferences(rootPath, basePath, comparePath);
  });
}
