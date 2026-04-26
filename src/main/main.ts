import { app, BrowserWindow, Menu, nativeTheme, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import type { WindowBootstrapContext } from '../shared/types';
import { attachExternalNavigationGuards } from './window-security';
import { restoreWindowState, bindWindowState } from './services/window-state';
import { SettingsStore } from './services/store';
import { ProjectService } from './services/project-service';
import { AiService } from './services/ai-service';
import { SkillRegistryService } from './services/skill-registry-service';
import { WorkspaceOrchestrator } from './services/workspace-orchestrator';
import { PlatformService } from './services/platform-service';
import { RuntimeAssetService } from './services/runtime-asset-service';
import { ModelRouter } from './services/model-router';
import { StructuredGenerationService } from './services/structured-generation-service';
import { CapabilityRuntime } from './services/capability-runtime';
import { DeliveryExportService } from './services/delivery-export-service';
import { RuntimeService } from './services/runtime-service';
import { RolePackageRegistryService } from './services/role-package-registry-service';
import { ConversationFlowService } from './services/conversation-flow-service';
import { AppLogService } from './services/app-log-service';
import { LiveLogService } from './services/live-log-service';
import { LiveLogConsoleService } from './services/live-log-console-service';
import { registerIpcHandlers } from './ipc';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
const childWindows = new Map<number, BrowserWindow>();
const windowContexts = new Map<number, WindowBootstrapContext>();
let ipcRegistered = false;

const userDataOverride = process.env.CYBER_EDITOR_USER_DATA;
if (userDataOverride) {
  app.setPath('userData', userDataOverride);
}

const appLogService = new AppLogService();
const liveLogService = new LiveLogService();
const liveLogConsoleService = new LiveLogConsoleService();
const settingsStore = new SettingsStore(appLogService);
const initialSettings = settingsStore.getSettings();
liveLogService.setEnabled(initialSettings.debug.liveLogConsoleEnabled);
appLogService.subscribe((record) => {
  liveLogService.mirrorAppRecord(record);
});
const platformService = new PlatformService();
const projectService = new ProjectService(platformService);
const aiService = new AiService();
const skillRegistry = new SkillRegistryService();
const rolePackageRegistry = new RolePackageRegistryService();
const runtimeAssets = new RuntimeAssetService(undefined, appLogService);
const orchestrator = new WorkspaceOrchestrator(projectService, runtimeAssets, skillRegistry);
const conversationFlowService = new ConversationFlowService(aiService);
const modelRouter = new ModelRouter();
const structuredGeneration = new StructuredGenerationService(aiService);
const capabilityRuntime = new CapabilityRuntime(projectService, platformService);
const deliveryExporter = new DeliveryExportService(projectService);
const runtimeService = new RuntimeService(
  projectService,
  runtimeAssets,
  modelRouter,
  structuredGeneration,
  capabilityRuntime,
  skillRegistry,
  deliveryExporter,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  liveLogService
);

function syncLiveLogSettings(enabled: boolean, reason: 'startup' | 'settings-enabled' = 'settings-enabled') {
  const wasEnabled = liveLogService.isEnabled();
  liveLogService.setEnabled(enabled);
  if (enabled && !wasEnabled) {
    liveLogService.beginSession(reason);
  }
  if (app.isReady()) {
    liveLogConsoleService.sync({
      enabled,
      logFilePath: liveLogService.getCurrentLogFilePath()
    });
  }
}

process.on('uncaughtException', (error) => {
  appLogService.error({
    source: 'main',
    event: 'process.uncaught-exception',
    message: 'Uncaught exception in the main process.',
    error
  });
});

process.on('unhandledRejection', (reason) => {
  appLogService.error({
    source: 'main',
    event: 'process.unhandled-rejection',
    message: 'Unhandled promise rejection in the main process.',
    error: reason
  });
});

function sendCommand(command: unknown) {
  const targetWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;
  if (!targetWindow || targetWindow.isDestroyed()) return;
  targetWindow.webContents.send('app:command', command);
}

function buildMenu(settingsStore: SettingsStore) {
  const recentItems = settingsStore.getSettings().recentProjects.map<MenuItemConstructorOptions>((entry) => ({
    label: entry.available ? `${entry.alias || entry.name}` : `[失效] ${entry.alias || entry.name}`,
    sublabel: entry.rootPath,
    enabled: entry.available,
    click: () => sendCommand({ type: 'project:open-recent', path: entry.rootPath })
  }));

  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '新建工程', accelerator: 'CmdOrCtrl+Alt+N', click: () => sendCommand({ type: 'project:new' }) },
        { label: '打开工程', accelerator: 'CmdOrCtrl+Alt+O', click: () => sendCommand({ type: 'project:open' }) },
        { label: '打开最近', submenu: recentItems.length ? recentItems : [{ label: '暂无最近工程', enabled: false }] },
        { type: 'separator' },
        { label: '导入文本文档', accelerator: 'CmdOrCtrl+Alt+I', click: () => sendCommand({ type: 'project:import-documents' }) },
        { type: 'separator' },
        { label: '关闭工程', accelerator: 'CmdOrCtrl+Alt+W', click: () => sendCommand({ type: 'project:close' }) },
        { label: '在系统中显示工程', click: () => sendCommand({ type: 'project:reveal' }) }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { label: '保存文档', accelerator: 'CmdOrCtrl+S', click: () => sendCommand({ type: 'doc:save' }) },
        { label: '重新打开已关闭文档', accelerator: 'CmdOrCtrl+Shift+T', click: () => sendCommand({ type: 'doc:reopen-last-closed' }) },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '显示工程视图', click: () => sendCommand({ type: 'view:set-activity', view: 'project' }) },
        { label: '显示编排视图', click: () => sendCommand({ type: 'view:set-activity', view: 'orchestration' }) },
        { label: '显示会话视图', click: () => sendCommand({ type: 'view:set-activity', view: 'sessions' }) },
        { label: '显示规则视图', click: () => sendCommand({ type: 'view:set-activity', view: 'rules' }) },
        { label: '显示资源视图', click: () => sendCommand({ type: 'view:set-activity', view: 'resources' }) },
        { label: '显示搜索视图', click: () => sendCommand({ type: 'view:set-activity', view: 'search' }) },
        { type: 'separator' },
        { label: '切换主侧栏', click: () => sendCommand({ type: 'view:toggle-left' }) },
        { label: '切换 AI 侧栏', click: () => sendCommand({ type: 'view:toggle-right' }) },
        { label: '切换流程面板', click: () => sendCommand({ type: 'view:toggle-process' }) },
        { type: 'separator' },
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' }
      ]
    },
    {
      label: '搜索',
      submenu: [
        { label: '命令面板', accelerator: 'CmdOrCtrl+Shift+P', click: () => sendCommand({ type: 'tools:command-palette' }) },
        { label: '工程搜索', accelerator: 'CmdOrCtrl+Shift+F', click: () => sendCommand({ type: 'search:project' }) },
        { label: '文档内查找', accelerator: 'CmdOrCtrl+F', click: () => sendCommand({ type: 'doc:find' }) },
        { label: '文档内替换', accelerator: 'CmdOrCtrl+H', click: () => sendCommand({ type: 'doc:replace' }) }
      ]
    },
    {
      label: '会话',
      submenu: [{ label: '新建会话', click: () => sendCommand({ type: 'session:new' }) }]
    },
    {
      label: '命令',
      submenu: [{ label: '打开命令面板', accelerator: 'F1', click: () => sendCommand({ type: 'tools:command-palette' }) }]
    },
    {
      label: 'AI',
      submenu: [
        { label: '生成阶段草稿', click: () => sendCommand({ type: 'ai:generate-stage' }) },
        { label: '确认当前阶段', click: () => sendCommand({ type: 'ai:confirm-stage' }) },
        { label: '执行红蓝审查', click: () => sendCommand({ type: 'ai:review' }) },
        { label: '生成 OpenSpec', click: () => sendCommand({ type: 'ai:generate-openspec' }) }
      ]
    },
    {
      label: '工具',
      submenu: [{ label: '设置', click: () => sendCommand({ type: 'tools:settings' }) }]
    },
    {
      label: '帮助',
      submenu: [{ label: '关于', enabled: false }, { label: '帮助文档', enabled: false }]
    },
    {
      label: '应用',
      submenu: [{ role: 'quit', label: '退出应用' }]
    }
  ];

  return Menu.buildFromTemplate(template);
}

function refreshMenu() {
  Menu.setApplicationMenu(buildMenu(settingsStore));
}

function normalizeWindowContext(context?: WindowBootstrapContext): WindowBootstrapContext {
  return {
    mode: context?.mode ?? 'main',
    rootPath: context?.rootPath ? path.resolve(context.rootPath) : undefined,
    documentPath: context?.documentPath ? path.resolve(context.documentPath) : undefined,
    sourceWebContentsId: context?.sourceWebContentsId
  };
}

function getDocumentWindowBounds() {
  const base = mainWindow?.getBounds();
  return {
    width: Math.max(960, (base?.width ?? 1440) - 120),
    height: Math.max(760, (base?.height ?? 960) - 96),
    x: base ? base.x + 44 : undefined,
    y: base ? base.y + 44 : undefined
  };
}

async function openDocumentWindow(input: { rootPath: string; filePath: string; sourceWebContentsId?: number }) {
  const window = await createWindow({
    mode: 'document',
    rootPath: input.rootPath,
    documentPath: input.filePath,
    sourceWebContentsId: input.sourceWebContentsId
  });
  window.focus();
}

async function createWindow(windowContext?: WindowBootstrapContext) {
  const devServerUrl = typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'string' ? MAIN_WINDOW_VITE_DEV_SERVER_URL : undefined;
  const rendererName = typeof MAIN_WINDOW_VITE_NAME === 'string' ? MAIN_WINDOW_VITE_NAME : 'main_window';
  const normalizedContext = normalizeWindowContext(windowContext);
  const isPrimaryWindow = normalizedContext.mode === 'main' && !mainWindow;
  const windowState = isPrimaryWindow ? restoreWindowState() : null;
  const childBounds = isPrimaryWindow ? {} : getDocumentWindowBounds();
  const window = new BrowserWindow({
    ...(windowState?.bounds ?? childBounds),
    minWidth: 820,
    minHeight: 760,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f6f4ee',
    autoHideMenuBar: process.platform !== 'darwin',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  attachExternalNavigationGuards(window.webContents);

  window.on('unresponsive', () => {
    appLogService.warn({
      source: 'window',
      event: 'window.unresponsive',
      message: 'Browser window became unresponsive.',
      metadata: {
        mode: normalizedContext.mode
      }
    });
  });

  window.on('responsive', () => {
    appLogService.info({
      source: 'window',
      event: 'window.responsive',
      message: 'Browser window recovered responsiveness.',
      metadata: {
        mode: normalizedContext.mode
      }
    });
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    appLogService.error({
      source: 'window',
      event: 'renderer.process-gone',
      message: 'Renderer process exited unexpectedly.',
      metadata: {
        mode: normalizedContext.mode,
        reason: details.reason,
        exitCode: details.exitCode,
        rootPath: normalizedContext.rootPath ?? null
      }
    });
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    appLogService.warn({
      source: 'window',
      event: 'renderer.did-fail-load',
      message: 'Renderer failed to load the main frame.',
      metadata: {
        mode: normalizedContext.mode,
        errorCode,
        errorDescription,
        validatedURL
      }
    });
  });

  const windowId = window.webContents.id;
  windowContexts.set(windowId, normalizedContext);

  if (isPrimaryWindow) {
    mainWindow = window;
    bindWindowState(window);
    if (!ipcRegistered) {
        registerIpcHandlers(
        () => {
          const candidate = mainWindow && !mainWindow.isDestroyed()
            ? mainWindow
            : BrowserWindow.getAllWindows().find((item) => !item.isDestroyed());
          if (!candidate) {
            throw new Error('Main window is unavailable.');
          }
          return candidate;
        },
        settingsStore,
        projectService,
        aiService,
        skillRegistry,
        rolePackageRegistry,
        orchestrator,
        conversationFlowService,
        runtimeService,
        platformService,
        appLogService,
        refreshMenu,
        {
          getWindowBootstrapContext: (webContentsId) => windowContexts.get(webContentsId) ?? { mode: 'main' },
          openDocumentWindow
        },
        (settings) => syncLiveLogSettings(settings.debug.liveLogConsoleEnabled)
      );
      ipcRegistered = true;
    }
  } else {
    childWindows.set(windowId, window);
  }

  refreshMenu();
  if (process.platform !== 'darwin') {
    window.setMenuBarVisibility(false);
  }

  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) {
      appLogService.info({
        source: 'window',
        event: 'window.ready-to-show',
        message: 'Window is ready to show.',
        metadata: {
          mode: normalizedContext.mode,
          windowId
        }
      });
      window.show();
    }
  });

  window.on('closed', () => {
    appLogService.info({
      source: 'window',
      event: 'window.closed',
      message: 'Window closed.',
      metadata: {
        mode: normalizedContext.mode,
        windowId
      }
    });
    windowContexts.delete(windowId);
    childWindows.delete(windowId);
    if (mainWindow === window) {
      const remainingChildren = [...childWindows.values()];
      childWindows.clear();
      for (const child of remainingChildren) {
        if (!child.isDestroyed()) {
          child.close();
        }
      }
      mainWindow = null;
    }
  });

  try {
    if (devServerUrl) {
      await window.loadURL(devServerUrl);
    } else {
      await window.loadFile(path.join(__dirname, `../renderer/${rendererName}/index.html`));
    }
  } catch (error) {
    appLogService.error({
      source: 'window',
      event: 'window.load.failed',
      message: 'Failed to load renderer content.',
      metadata: {
        mode: normalizedContext.mode,
        rendererName,
        devServerUrl: devServerUrl ?? null
      },
      error
    });
    throw error;
  }

  return window;
}

app.whenReady()
  .then(async () => {
    if (initialSettings.debug.liveLogConsoleEnabled) {
      liveLogService.beginSession('startup');
    }
    syncLiveLogSettings(initialSettings.debug.liveLogConsoleEnabled, 'startup');
    appLogService.info({
      source: 'main',
      event: 'app.ready',
      message: 'Electron app is ready.',
      metadata: {
        logFilePath: appLogService.getCurrentLogFilePath()
      }
    });

    await createWindow({ mode: 'main' });

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow({ mode: 'main' });
      }
    });
  })
  .catch((error) => {
    appLogService.error({
      source: 'main',
      event: 'app.ready.failed',
      message: 'Failed during Electron app startup.',
      error
    });
    throw error;
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
