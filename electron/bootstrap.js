const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

// Keep the existing app intact; this bootstrap adds true desktop-widget behavior.
require('./main.js');

const EXTRA_DEFAULTS = {
  desktopMode: true,
  lockWidget: false,
  theme: 'dark'
};

let extra = null;
let desktopAttached = false;

function extraFile() {
  return path.join(app.getPath('userData'), 'widget-extra-settings.json');
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

function runHelper(command, win) {
  return new Promise(resolve => {
    if (process.platform !== 'win32') return resolve({ ok: false, error: 'Solo disponible en Windows.' });
    const helper = helperPath();
    if (!helper || !fs.existsSync(helper)) return resolve({ ok: false, error: 'No se encontró DesktopHost.exe.' });
    const b = win.getBounds();
    const args = [command, hwndString(win), String(b.x), String(b.y), String(b.width), String(b.height)];
    execFile(helper, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) return resolve({ ok: false, error: String(stderr || error.message).trim() });
      resolve({ ok: true, message: String(stdout || '').trim() });
    });
  });
}

async function applyDesktopMode(enabled) {
  const win = currentWindow();
  if (!win) return { ok: false, error: 'No hay ventana activa.' };
  const value = Boolean(enabled);
  saveExtra({ desktopMode: value });

  if (value) {
    win.setAlwaysOnTop(false);
    win.setSkipTaskbar(true);
    const result = await runHelper('attach', win);
    desktopAttached = Boolean(result.ok);
    return result;
  }

  if (desktopAttached) {
    await runHelper('detach', win);
    desktopAttached = false;
  }
  win.setSkipTaskbar(true);
  return { ok: true };
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

app.whenReady().then(() => {
  loadExtra();
  // main.js creates the BrowserWindow in its own whenReady callback first.
  setTimeout(async () => {
    const win = currentWindow();
    if (!win) return;
    applyLock(Boolean(extra.lockWidget));
    if (extra.desktopMode) await applyDesktopMode(true);
  }, 500);
});
