import path from 'node:path';
import { dialog, ipcMain, shell } from 'electron';
import type { IpcRegistrationContext } from './context';

export function registerRecentSystemIpc(context: IpcRegistrationContext) {
  ipcMain.handle('dialog:create-project-base', async (_event, mode: 'create-in-parent' | 'use-existing-directory' = 'create-in-parent') => {
    const result = await dialog.showOpenDialog(context.getMainWindow(), {
      properties: mode === 'create-in-parent'
        ? ['openDirectory', 'createDirectory']
        : ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('recent:rename', async (_event, rootPath: string, alias: string) => {
    context.settingsStore.renameRecentProject(rootPath, alias);
    context.refreshMenu();
    return context.buildBootstrap(context.getActiveProjectRoot());
  });

  ipcMain.handle('recent:remove', async (_event, rootPath: string) => {
    const activeRoot = context.getActiveProjectRoot();
    if (activeRoot && path.resolve(activeRoot) === path.resolve(rootPath)) {
      context.setActiveProjectRoot(null);
      context.settingsStore.clearActiveProject();
    }
    context.settingsStore.removeRecentProject(rootPath);
    context.refreshMenu();
    return context.buildBootstrap(context.getActiveProjectRoot());
  });

  ipcMain.handle('recent:clear-invalid', async () => {
    context.settingsStore.clearInvalidRecentProjects();
    const activeRoot = context.getActiveProjectRoot();
    if (activeRoot && !context.projectService.validateProject(activeRoot)) {
      context.setActiveProjectRoot(null);
      context.settingsStore.clearActiveProject();
    }
    context.refreshMenu();
    return context.buildBootstrap(context.getActiveProjectRoot());
  });

  ipcMain.handle('recent:clear-all', async () => {
    context.setActiveProjectRoot(null);
    context.settingsStore.clearAllRecentProjects();
    context.refreshMenu();
    return context.buildBootstrap(null);
  });

  ipcMain.handle('recent:reveal', async (_event, rootPath: string) => {
    if (!rootPath) return false;
    const result = await shell.openPath(rootPath);
    return !result;
  });

  ipcMain.handle('path:basename', (_event, filePath: string) => path.basename(filePath));
}
