import { app, BrowserWindow, Rectangle } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

type WindowState = {
  bounds: Rectangle;
};

const defaultBounds: Rectangle = {
  width: 1440,
  height: 960,
  x: 100,
  y: 100
};

function getStateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

export function restoreWindowState(): WindowState {
  try {
    const raw = fs.readFileSync(getStateFile(), 'utf8');
    const parsed = JSON.parse(raw) as WindowState;
    if (parsed?.bounds?.width && parsed?.bounds?.height) {
      return parsed;
    }
  } catch {
    // no-op
  }
  return { bounds: defaultBounds };
}

export function bindWindowState(window: BrowserWindow) {
  const persist = () => {
    if (window.isDestroyed()) return;
    const bounds = window.getBounds();
    fs.mkdirSync(path.dirname(getStateFile()), { recursive: true });
    fs.writeFileSync(getStateFile(), JSON.stringify({ bounds }, null, 2), 'utf8');
  };

  window.on('resize', persist);
  window.on('move', persist);
  window.on('close', persist);
}
