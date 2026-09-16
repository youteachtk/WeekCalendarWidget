const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

// Adds native Windows desktop-widget behavior to the existing app.
require('./main.js');

const EXTRA_DEFAULTS = {
  desktopMode: true,
  reserveIconSpace: true,
  lockWidget: false,
  theme: 'dark'
};

let extra = null;
let desktopAttached = false;
let iconTimer = null;

function extraFile() {
  return path.join(app.getPath('userData'), 'widget-extra-settings.json');
}

function iconStateFile() {
  return path.join(app.getPath('userData'), 'desktop-icon-layout.json');
}

function loadExtra() {
  if (extra) return extra;
  try {
    extra = { ...EXTRA_DEFAULTS, ...JSON.parse(fs.readFileSync(extraFile(), 'utf8')) };
  } catch {
    extra = { ...EXTRA_DEFAULTS };
  }
  return extra;
}

function saveExtra(patch = {}) {
  extra = { ...loadExtra(), ...patch };
  fs.mkdirSync(path.dirname(extraFile()), { recursive: true });
  fs.writeFileSync(extraFile(), JSON.stringify(extra, null, 2), 'utf8');
  return extra;
}

function currentWindow() {
  return BrowserWindow.getAllWindows().find(w => !w.isDestroyed()) || null;
}

function helperPath() {
  if (process.platform !== 'win32') return null;
  if (app.isPackaged) return path.join(process.resourcesPath, 'native', 'DesktopHost.exe');
  return path.join(__dirname, '..', 'native', 'DesktopHost', 'publish', 'DesktopHost.exe');
}

function hwndString(win) {
  const buf = win.getNativeWindowHandle();
  return buf.length >= 8 ? buf.readBigUInt64LE(0).toString() : String(buf.readUInt32LE(0));
}

function runHelper(command, win, extraArgs = []) {
  return new Promise(resolve => {
    if (process.platform !== 'win32') return resolve({ ok: false, error: 'Solo disponible en Windows.' });
    const helper = helperPath();
    if (!helper || !fs.existsSync(helper)) return resolve({ ok: false, error: 'No se encontró DesktopHost.exe.' });
    const b = win.getBounds();
    const args = [command, hwndString(win), String(b.x), String(b.y), String(b.width), String(b.height), ...extraArgs];
    execFile(helper, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) return resolve({ ok: false, error: String(stderr || error.message).trim() });
      const message = String(stdout || '').trim();
      let parsed = null;
      try { parsed = JSON.parse(message); } catch {}
      resolve({ ok: true, message, ...(parsed || {}) });
    });
  });
}

async function applyIconReservation() {
  const win = currentWindow();
  const s = loadExtra();
  if (!win) return { ok: false, error: 'No hay ventana activa.' };
  if (!s.desktopMode || !s.reserveIconSpace) return { ok: true, moved: 0 };
  return runHelper('reserve-icons', win, [iconStateFile()]);
}

async function restoreIcons() {
  const win = currentWindow();
  if (!win) return { ok: false, error: 'No hay ventana activa.' };
  return runHelper('restore-icons', win, [iconStateFile()]);
}

function scheduleIconReservation() {
  clearTimeout(iconTimer);
  iconTimer = setTimeout(() => {
    if (loadExtra().desktopMode && loadExtra().reserveIconSpace) {
      applyIconReservation().catch(() => {});
    }
  }, 350);
}

async function applyDesktopMode(enabled) {
  const win = currentWindow();
  if (!win) return { ok: false, error: 'No hay ventana activa.' };
  const value = Boolean(enabled);

  if (!value && loadExtra().reserveIconSpace) await restoreIcons();
  saveExtra({ desktopMode: value });

  if (value) {
    win.setAlwaysOnTop(false);
    win.setSkipTaskbar(true);
    win.setMinimizable(false);
    const result = await runHelper('attach', win);
    desktopAttached = Boolean(result.ok);
    if (result.ok) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.showInactive();
      if (loadExtra().reserveIconSpace) {
        const iconResult = await applyIconReservation();
        result.iconResult = iconResult;
      }
    }
    return result;
  }

  if (desktopAttached) {
    await runHelper('detach', win);
    desktopAttached = false;
  }
  win.setMinimizable(true);
  win.setSkipTaskbar(true);
  return { ok: true };
}

function protectDesktopWidget(win) {
  win.on('minimize', (event) => {
    if (!loadExtra().desktopMode) return;
    event.preventDefault();
    setTimeout(async () => {
      if (win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.showInactive();
      if (!desktopAttached) await applyDesktopMode(true);
    }, 25);
  });

  win.on('hide', () => {
    if (!loadExtra().desktopMode) return;
    setTimeout(async () => {
      if (win.isDestroyed() || !loadExtra().desktopMode) return;
      if (!win.isVisible()) win.showInactive();
      if (!desktopAttached) await applyDesktopMode(true);
    }, 25);
  });

  win.on('move', scheduleIconReservation);
  win.on('resize', scheduleIconReservation);
}

function applyLock(value) {
  const win = currentWindow();
  saveExtra({ lockWidget: Boolean(value) });
  if (win) {
    win.setMovable(!value);
    win.setResizable(!value);
  }
  return loadExtra();
}

ipcMain.handle('widget-extra:get', () => loadExtra());
ipcMain.handle('widget-extra:set-theme', (_e, value) => {
  const theme = ['dark', 'light', 'system'].includes(value) ? value : 'dark';
  return saveExtra({ theme });
});
ipcMain.handle('widget-extra:set-lock', (_e, value) => applyLock(Boolean(value)));
ipcMain.handle('widget-extra:set-desktop-mode', async (_e, value) => {
  const result = await applyDesktopMode(Boolean(value));
  return { settings: loadExtra(), result };
});
ipcMain.handle('widget-extra:set-reserve-icons', async (_e, value) => {
  const enabled = Boolean(value);
  saveExtra({ reserveIconSpace: enabled });
  const result = enabled ? await applyIconReservation() : await restoreIcons();
  return { settings: loadExtra(), result };
});

app.whenReady().then(() => {
  loadExtra();
  setTimeout(async () => {
    const win = currentWindow();
    if (!win) return;
    protectDesktopWidget(win);
    applyLock(Boolean(extra.lockWidget));
    if (extra.desktopMode) await applyDesktopMode(true);
  }, 500);
});
