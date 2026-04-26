import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { dialog, ipcMain } from 'electron';
import type { DraftOrchestrationSnapshot, ProjectTemplatePackage, ProjectTemplateSaveInput } from '../../shared/types';
import type { IpcRegistrationContext } from './context';

export function registerResourceIpc(context: IpcRegistrationContext) {
  ipcMain.handle('templates:install-url', async (_event, packageUrl: string, approved = false) => {
    const governed = await context.platformService.inspectTemplatePackageFromUrl(packageUrl);
    return context.completeGovernedInstall('template', packageUrl, approved, governed, (packageValue) => {
      const installed = context.platformService.installTemplatePackage(packageValue, packageUrl, {
        trust: governed.review.trust,
        compatibility: governed.review.compatibility,
        issueMessage: governed.review.summary,
        verificationId: governed.verification.id
      });
      context.settingsStore.markRecentTemplate(installed.id);
      context.settingsStore.markRecentResource(`template-url:${packageUrl}`);
    });
  });

  ipcMain.handle('templates:install-path', async (_event, targetPath: string, approved = false) => {
    const governed = context.resourceGovernance.verifyTemplateImportFromPath(targetPath);
    return context.completeGovernedInstall('template', path.resolve(targetPath), approved, governed, (packageValue) => {
      const installed = context.platformService.installTemplatePackage(packageValue, `local:${path.resolve(targetPath)}`, {
        trust: governed.review.trust,
        compatibility: governed.review.compatibility,
        issueMessage: governed.review.summary,
        verificationId: governed.verification.id
      });
      context.settingsStore.markRecentTemplate(installed.id);
      context.settingsStore.markRecentResource(`template-path:${path.resolve(targetPath)}`);
    });
  });

  ipcMain.handle('templates:get-package', async (_event, templateId: string) => {
    return context.platformService.getTemplatePackage(templateId);
  });

  ipcMain.handle('templates:check-update', async (_event, templateId: string) => {
    await context.platformService.checkTemplateForUpdate(templateId);
    return context.buildBootstrap(context.getActiveProjectRoot());
  });

  ipcMain.handle('templates:repair', async (_event, templateId: string) => {
    await context.platformService.repairTemplate(templateId);
    return context.buildBootstrap(context.getActiveProjectRoot());
  });

  ipcMain.handle('templates:update', async (_event, templateId: string) => {
    await context.platformService.updateTemplate(templateId);
    return context.buildBootstrap(context.getActiveProjectRoot());
  });

  ipcMain.handle('templates:mark-recent', async (_event, templateId: string) => context.settingsStore.markRecentTemplate(templateId));

  ipcMain.handle('templates:save-draft', async (_event, templatePackage: ProjectTemplatePackage, sourceLabel?: string) => {
    context.platformService.installTemplatePackage(templatePackage, sourceLabel);
    context.settingsStore.markRecentTemplate(templatePackage.definition.id);
    context.settingsStore.markRecentResource(`template:${templatePackage.definition.id}`);
    return context.buildBootstrap(context.getActiveProjectRoot());
  });

  ipcMain.handle('templates:save-project', async (_event, input: ProjectTemplateSaveInput) => {
    const rootPath = context.requireActiveRoot();
    const templatePackage = context.runtimeService.buildTemplatePackage(rootPath, input);
    context.platformService.installTemplatePackage(templatePackage, `project:${rootPath}`);
    context.settingsStore.markRecentTemplate(templatePackage.definition.id);
    context.settingsStore.markRecentResource(`template:${templatePackage.definition.id}`);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('drafts:save', async (_event, snapshot: DraftOrchestrationSnapshot) => context.settingsStore.saveDraftSnapshot(snapshot));
  ipcMain.handle('drafts:get', async (_event, id: string) => context.settingsStore.getDraftSnapshot(id));
  ipcMain.handle('drafts:remove', async (_event, id: string) => context.settingsStore.removeDraftSnapshot(id));

  ipcMain.handle('templates:choose-source', async () => {
    const result = await dialog.showOpenDialog(context.getMainWindow(), {
      properties: ['openFile', 'openDirectory'],
      filters: [{ name: 'Template Package', extensions: ['json'] }]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('skills:list-catalog', async (_event, catalogUrl?: string) => context.skillRegistry.loadCatalog(catalogUrl));

  ipcMain.handle('skills:install-url', async (_event, packageUrl: string, approved = false) => {
    const governed = await context.skillRegistry.inspectPackageFromUrl(packageUrl);
    return context.completeGovernedInstall('skill', packageUrl, approved, governed, (packageValue) => {
      const installed = context.skillRegistry.installPackage(packageValue, packageUrl, {
        trust: governed.review.trust,
        compatibility: governed.review.compatibility,
        issueMessage: governed.review.summary,
        verificationId: governed.verification.id
      });
      context.settingsStore.markRecentResource(`skill:${installed.id}`);
      const rootPath = context.getActiveProjectRoot();
      if (rootPath) {
        context.projectService.appendAudit(rootPath, {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          type: 'skill.installed',
          message: `Installed skill ${installed.id}`,
          metadata: { source: installed.source }
        });
      }
    });
  });

  ipcMain.handle('skills:install-path', async (_event, targetPath: string, approved = false) => {
    const governed = context.resourceGovernance.verifySkillImportFromPath(targetPath);
    return context.completeGovernedInstall('skill', path.resolve(targetPath), approved, governed, (packageValue) => {
      const installed = context.skillRegistry.installPackage(packageValue, `local:${path.resolve(targetPath)}`, {
        trust: governed.review.trust,
        compatibility: governed.review.compatibility,
        issueMessage: governed.review.summary,
        verificationId: governed.verification.id
      });
      context.settingsStore.markRecentResource(`skill:${installed.id}`);
      const rootPath = context.getActiveProjectRoot();
      if (rootPath) {
        context.projectService.appendAudit(rootPath, {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          type: 'skill.installed',
          message: `Imported skill ${installed.id}`,
          metadata: { source: installed.source }
        });
      }
    });
  });

  ipcMain.handle('skills:choose-source', async () => {
    const result = await dialog.showOpenDialog(context.getMainWindow(), {
      properties: ['openFile', 'openDirectory'],
      filters: [{ name: 'Skill Package', extensions: ['json'] }]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('skills:choose-catalog-source', async () => {
    const result = await dialog.showOpenDialog(context.getMainWindow(), {
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('skills:delete', async (_event, skillId: string) => {
    const references: string[] = [];
    const rootPath = context.getActiveProjectRoot();
    if (rootPath) {
      if (context.projectService.loadProjectSkillIds(rootPath).includes(skillId)) {
        references.push('project-default');
      }
      for (const [sessionId, skillIds] of Object.entries(context.projectService.loadSessionSkillIds(rootPath))) {
        if (skillIds.includes(skillId)) {
          references.push(`session:${sessionId}`);
        }
      }
    }
    context.skillRegistry.removeSkill(skillId, references);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('skills:set-project', async (_event, skillIds: string[]) => {
    const rootPath = context.requireActiveRoot();
    context.projectService.saveProjectSkillIds(rootPath, skillIds);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('skills:set-session', async (_event, sessionId: string, skillIds: string[]) => {
    const rootPath = context.requireActiveRoot();
    const map = context.projectService.loadSessionSkillIds(rootPath);
    map[sessionId] = skillIds;
    context.projectService.saveSessionSkillIds(rootPath, map);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('roles:list-catalog', async (_event, catalogUrl?: string) => context.rolePackageRegistry.loadCatalog(catalogUrl));

  ipcMain.handle('roles:install-url', async (_event, packageUrl: string, approved = false) => {
    const governed = await context.rolePackageRegistry.inspectPackageFromUrl(packageUrl);
    return context.completeGovernedInstall('role-package', packageUrl, approved, governed, (packageValue) => {
      const installed = context.rolePackageRegistry.installPackage(packageValue, packageUrl, {
        trust: governed.review.trust,
        compatibility: governed.review.compatibility,
        issueMessage: governed.review.summary,
        verificationId: governed.verification.id
      });
      context.settingsStore.markRecentResource(`role-package:${installed.id}`);
      const rootPath = context.getActiveProjectRoot();
      if (rootPath) {
        context.projectService.appendAudit(rootPath, {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          type: 'role-package.installed',
          message: `Installed role package ${installed.id}`,
          metadata: { source: installed.source }
        });
      }
    });
  });

  ipcMain.handle('roles:install-path', async (_event, targetPath: string, approved = false) => {
    const governed = context.resourceGovernance.verifyRolePackageImportFromPath(targetPath);
    return context.completeGovernedInstall('role-package', path.resolve(targetPath), approved, governed, (packageValue) => {
      const installed = context.rolePackageRegistry.installPackage(packageValue, `local:${path.resolve(targetPath)}`, {
        trust: governed.review.trust,
        compatibility: governed.review.compatibility,
        issueMessage: governed.review.summary,
        verificationId: governed.verification.id
      });
      context.settingsStore.markRecentResource(`role-package:${installed.id}`);
      const rootPath = context.getActiveProjectRoot();
      if (rootPath) {
        context.projectService.appendAudit(rootPath, {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          type: 'role-package.installed',
          message: `Imported role package ${installed.id}`,
          metadata: { source: installed.source }
        });
      }
    });
  });

  ipcMain.handle('roles:choose-source', async () => {
    const result = await dialog.showOpenDialog(context.getMainWindow(), {
      properties: ['openFile', 'openDirectory'],
      filters: [{ name: 'Role Package', extensions: ['json'] }]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('roles:choose-catalog-source', async () => {
    const result = await dialog.showOpenDialog(context.getMainWindow(), {
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });
}
