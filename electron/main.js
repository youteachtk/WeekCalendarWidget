const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { google } = require('googleapis');

const APP_NAME = 'WeekCal Widget';
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly'
];
const SETTINGS_DEFAULTS = {
  alwaysOnTop: false,
  startWithWindows: true,
  opacity: 0.97,
  weekStartsMonday: true,
  visibleDays: 7,
  dayStartHour: 8,
  dayEndHour: 23,
  selectedCalendars: [],
  windowBounds: null,
  lastRefresh: null
};

let mainWindow = null;
let settings = null;
let oauthClient = null;

function appendCrashLog(label, details = '') {
  try {
    const line = `[${new Date().toISOString()}] ${label} ${String(details || '')}\n`;
    fs.appendFileSync(userFile('weekcal-crash.log'), line, 'utf8');
  } catch {}
}

process.on('uncaughtException', (error) => appendCrashLog('uncaughtException', error?.stack || error));
process.on('unhandledRejection', (reason) => appendCrashLog('unhandledRejection', reason?.stack || reason));

function userFile(name) {
  return path.join(app.getPath('userData'), name);
}

function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function loadSettings() {
  settings = { ...SETTINGS_DEFAULTS, ...readJson(userFile('settings.json'), {}) };
  return settings;
}

function saveSettings(patch = {}) {
  settings = { ...settings, ...patch };
  writeJson(userFile('settings.json'), settings);
  return settings;
}

function protectJson(obj) {
  const raw = JSON.stringify(obj);
  if (safeStorage.isEncryptionAvailable()) {
    return { encrypted: true, value: safeStorage.encryptString(raw).toString('base64') };
  }
  return { encrypted: false, value: Buffer.from(raw, 'utf8').toString('base64') };
}

function unprotectJson(record) {
  if (!record?.value) return null;
  const data = Buffer.from(record.value, 'base64');
  const raw = record.encrypted && safeStorage.isEncryptionAvailable()
    ? safeStorage.decryptString(data)
    : data.toString('utf8');
  return JSON.parse(raw);
}

function saveSecure(name, obj) {
  writeJson(userFile(name), protectJson(obj));
}

function readSecure(name) {
  try { return unprotectJson(readJson(userFile(name), null)); } catch { return null; }
}

function defaultBounds() {
  const work = screen.getPrimaryDisplay().workArea;
  const width = Math.min(1320, Math.max(980, Math.round(work.width * 0.78)));
  const height = Math.min(860, Math.max(650, Math.round(work.height * 0.82)));
  return {
    width,
    height,
    x: work.x + work.width - width - 24,
    y: work.y + Math.max(16, Math.round((work.height - height) / 2))
  };
}

function createWindow() {
  const bounds = settings.windowBounds || defaultBounds();
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 640,
    minHeight: 420,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    movable: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: Boolean(settings.alwaysOnTop),
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setOpacity(Number(settings.opacity || 0.97));
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    appendCrashLog('render-process-gone', JSON.stringify(details));
  });
  mainWindow.webContents.on('unresponsive', () => appendCrashLog('renderer-unresponsive'));
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html')).catch(err => appendCrashLog('loadFile', err?.stack || err));
  mainWindow.once('ready-to-show', () => {
    mainWindow.showInactive();
  });

  let saveTimer;
  const rememberBounds = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!mainWindow?.isDestroyed()) saveSettings({ windowBounds: mainWindow.getBounds() });
    }, 300);
  };
  mainWindow.on('move', rememberBounds);
  mainWindow.on('resize', rememberBounds);
}

function getCredentialsRecord() {
  return readSecure('google-credentials.secure.json');
}

function getTokenRecord() {
  return readSecure('google-token.secure.json');
}

function normalizeClientConfig(json) {
  const cfg = json.installed || json.web;
  if (!cfg?.client_id || !cfg?.client_secret) throw new Error('El archivo no parece ser una credencial OAuth de Google válida.');
  return { client_id: cfg.client_id, client_secret: cfg.client_secret };
}

function bc2ColorFromDescription(description = '') {
  const match = String(description).match(/(?:^|\n)\s*BC2-Color:\s*(-?\d+)/i);
  if (!match) return null;
  try {
    let value = Number(match[1]);
    if (!Number.isFinite(value)) return null;
    value = value >>> 0;
    return '#' + (value & 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase();
  } catch {
    return null;
  }
}

function createOAuthClient(credentials, redirectUri) {
  const client = new google.auth.OAuth2(credentials.client_id, credentials.client_secret, redirectUri);
  const token = getTokenRecord();
  if (token) client.setCredentials(token);
  client.on('tokens', (tokens) => {
    const merged = { ...(getTokenRecord() || {}), ...tokens };
    saveSecure('google-token.secure.json', merged);
  });
  return client;
}

async function ensureOAuthClient() {
  if (oauthClient) return oauthClient;
  const creds = getCredentialsRecord();
  if (!creds) return null;
  oauthClient = createOAuthClient(creds, 'http://127.0.0.1');
  return oauthClient;
}

async function performOAuth(credentials) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1');
        if (u.pathname !== '/oauth2callback') {
          res.writeHead(404); res.end('Not found'); return;
        }
        const code = u.searchParams.get('code');
        const err = u.searchParams.get('error');
        if (err) throw new Error(err);
        if (!code) throw new Error('Google no devolvió el código de autorización.');
        const redirectUri = `http://127.0.0.1:${server.address().port}/oauth2callback`;
        oauthClient = createOAuthClient(credentials, redirectUri);
        const { tokens } = await oauthClient.getToken(code);
        const storedTokens = { ...tokens, weekcalWriteEnabled: true };
        oauthClient.setCredentials(storedTokens);
        saveSecure('google-token.secure.json', storedTokens);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body style="font-family:Segoe UI;padding:40px;background:#111;color:#eee"><h2>WeekCal autorizado</h2><p>Ya puedes cerrar esta pestaña y volver al widget.</p></body></html>');
        server.close();
        resolve({ connected: true, writeEnabled: true });
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(e.message);
        server.close();
        reject(e);
      }
    });

    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
      oauthClient = createOAuthClient(credentials, redirectUri);
      const authUrl = oauthClient.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: true,
        scope: GOOGLE_SCOPES
      });
      await shell.openExternal(authUrl);
    });

    server.on('error', reject);
  });
}

async function connectGoogle() {
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecciona las credenciales OAuth de Google',
    properties: ['openFile'],
    filters: [{ name: 'Google OAuth JSON', extensions: ['json'] }]
  });
  if (picked.canceled || !picked.filePaths[0]) return { canceled: true };

  const parsed = JSON.parse(fs.readFileSync(picked.filePaths[0], 'utf8'));
  const creds = normalizeClientConfig(parsed);
  saveSecure('google-credentials.secure.json', creds);
  return performOAuth(creds);
}

async function authorizeGoogleWrite() {
  const creds = getCredentialsRecord();
  if (!creds) throw new Error('Primero conecta Google Calendar desde Configuración.');
  return performOAuth(creds);
}

function tokenHasWriteScope() {
  const token = getTokenRecord();
  if (token?.weekcalWriteEnabled === true) return true;
  const scope = String(token?.scope || '');
  return scope.includes('/auth/calendar.events') || /\/auth\/calendar(?:\s|$)/.test(scope);
}

async function googleStatus() {
  const creds = getCredentialsRecord();
  const token = getTokenRecord();
  if (!creds || !token) return { connected: false };
  try {
    const client = await ensureOAuthClient();
    const cal = google.calendar({ version: 'v3', auth: client });
    const res = await cal.calendarList.list({ maxResults: 1 });
    return { connected: true, calendarsKnown: Boolean(res.data.items?.length), writeEnabled: tokenHasWriteScope() };
  } catch (e) {
    return { connected: false, error: e.message };
  }
}

async function listGoogleCalendars() {
  const client = await ensureOAuthClient();
  if (!client) return [];
  const cal = google.calendar({ version: 'v3', auth: client });
  const res = await cal.calendarList.list({ maxResults: 250, showHidden: true });
  return (res.data.items || []).map(item => ({
    id: item.id,
    name: item.summary || item.id,
    primary: Boolean(item.primary),
    accessRole: item.accessRole,
    backgroundColor: item.backgroundColor || '#4f7cff',
    foregroundColor: item.foregroundColor || '#ffffff',
    selected: item.selected !== false,
    writable: ['owner', 'writer'].includes(item.accessRole)
  }));
}

async function fetchGoogleEvents({ timeMin, timeMax, calendarIds }) {
  const client = await ensureOAuthClient();
  if (!client) return { events: [], colors: {} };
  const cal = google.calendar({ version: 'v3', auth: client });
  const calendars = await listGoogleCalendars();
  const wanted = (calendarIds?.length ? calendarIds : calendars.filter(c => c.selected).map(c => c.id));
  const calMap = Object.fromEntries(calendars.map(c => [c.id, c]));
  const colorsRes = await cal.colors.get();
  const eventColors = colorsRes.data.event || {};

  const all = [];
  for (const id of wanted) {
    let pageToken;
    do {
      const res = await cal.events.list({
        calendarId: id,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 2500,
        pageToken
      });
      for (const ev of res.data.items || []) {
        const meta = calMap[id] || { name: id, backgroundColor: '#4f7cff', foregroundColor: '#fff' };
        const palette = ev.colorId ? eventColors[ev.colorId] : null;
        const bc2Color = bc2ColorFromDescription(ev.description);
        all.push({
          id: ev.id,
          calendarId: id,
          calendarName: meta.name,
          title: ev.summary || '(Sin título)',
          start: ev.start?.dateTime || ev.start?.date,
          end: ev.end?.dateTime || ev.end?.date,
          allDay: Boolean(ev.start?.date),
          color: bc2Color || palette?.background || meta.backgroundColor,
          foreground: bc2Color ? '#ffffff' : (palette?.foreground || meta.foregroundColor || '#fff'),
          location: ev.location || '',
          description: ev.description || '',
          colorId: ev.colorId || '',
          recurringEventId: ev.recurringEventId || '',
          originalStartTime: ev.originalStartTime?.dateTime || ev.originalStartTime?.date || '',
          status: ev.status || 'confirmed',
          htmlLink: ev.htmlLink || ''
        });
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);
  }

  saveSettings({ lastRefresh: new Date().toISOString() });
  return { events: all, colors: eventColors };
}

function datePlusOne(dateString) {
  const d = new Date(dateString + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

function cleanDescription(description = '') {
  return String(description)
    .split(/\r?\n/)
    .filter(line => !/^\s*BC2-Color:\s*-?\d+\s*$/i.test(line))
    .join('\n')
    .trim();
}

function bc2SignedFromHex(hex = '') {
  const clean = String(hex).replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const argb = (0xFF000000 | parseInt(clean, 16)) >>> 0;
  return argb > 0x7FFFFFFF ? argb - 0x100000000 : argb;
}

function buildEventResource(payload, includeRecurrence = false) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City';
  const colorHex = payload.colorHex || null;
  const marker = colorHex ? `BC2-Color: ${bc2SignedFromHex(colorHex)}` : '';
  const notes = cleanDescription(payload.description || '');
  const description = [marker, notes].filter(Boolean).join('\n\n');

  const resource = {
    summary: String(payload.title || '').trim() || '(Sin título)',
    location: String(payload.location || '').trim(),
    description,
    colorId: payload.colorId || undefined
  };

  if (payload.allDay) {
    resource.start = { date: payload.date };
    resource.end = { date: datePlusOne(payload.date) };
  } else {
    resource.start = { dateTime: `${payload.date}T${payload.startTime}:00`, timeZone: timezone };
    resource.end = { dateTime: `${payload.date}T${payload.endTime}:00`, timeZone: timezone };
  }

  if (includeRecurrence && payload.repeat && payload.repeat !== 'none') {
    resource.recurrence = [`RRULE:FREQ=${payload.repeat}`];
  }

  if (payload.reminder === 'none') {
    resource.reminders = { useDefault: false, overrides: [] };
  } else if (payload.reminder && payload.reminder !== 'default') {
    resource.reminders = {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: Number(payload.reminder) }]
    };
  } else {
    resource.reminders = { useDefault: true };
  }

  return resource;
}

async function listGoogleEventColors() {
  const client = await ensureOAuthClient();
  if (!client) return {};
  const cal = google.calendar({ version: 'v3', auth: client });
  const res = await cal.colors.get();
  return res.data.event || {};
}

async function createGoogleEvent(payload) {
  const client = await ensureOAuthClient();
  if (!client) throw new Error('Google Calendar no está conectado.');
  if (!tokenHasWriteScope()) throw new Error('WRITE_AUTH_REQUIRED');

  const cal = google.calendar({ version: 'v3', auth: client });
  const calendarId = payload.calendarId || 'primary';
  const res = await cal.events.insert({
    calendarId,
    requestBody: buildEventResource(payload, true),
    sendUpdates: 'none'
  });
  return { id: res.data.id, htmlLink: res.data.htmlLink };
}

async function updateGoogleEvent(payload) {
  const client = await ensureOAuthClient();
  if (!client) throw new Error('Google Calendar no está conectado.');
  if (!tokenHasWriteScope()) throw new Error('WRITE_AUTH_REQUIRED');
  if (!payload.id) throw new Error('Falta el identificador del evento.');

  const cal = google.calendar({ version: 'v3', auth: client });
  const calendarId = payload.calendarId || 'primary';
  const res = await cal.events.patch({
    calendarId,
    eventId: payload.id,
    requestBody: buildEventResource(payload, false),
    sendUpdates: 'none'
  });
  return { id: res.data.id, htmlLink: res.data.htmlLink };
}

async function deleteGoogleEvent(payload) {
  const client = await ensureOAuthClient();
  if (!client) throw new Error('Google Calendar no está conectado.');
  if (!tokenHasWriteScope()) throw new Error('WRITE_AUTH_REQUIRED');
  if (!payload.id) throw new Error('Falta el identificador del evento.');

  const cal = google.calendar({ version: 'v3', auth: client });
  await cal.events.delete({
    calendarId: payload.calendarId || 'primary',
    eventId: payload.id,
    sendUpdates: 'none'
  });
  return { deleted: true };
}

app.whenReady().then(async () => {
  loadSettings();
  app.setName(APP_NAME);
  app.setLoginItemSettings({ openAtLogin: Boolean(settings.startWithWindows) });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('widget:get-settings', () => settings || loadSettings());
ipcMain.handle('widget:set-pin', (_e, value) => {
  saveSettings({ alwaysOnTop: Boolean(value) });
  mainWindow?.setAlwaysOnTop(Boolean(value));
  return settings;
});
ipcMain.handle('widget:set-startup', (_e, value) => {
  saveSettings({ startWithWindows: Boolean(value) });
  app.setLoginItemSettings({ openAtLogin: Boolean(value) });
  return settings;
});
ipcMain.handle('widget:set-opacity', (_e, value) => {
  const opacity = Math.max(0.60, Math.min(1, Number(value)));
  saveSettings({ opacity });
  mainWindow?.setOpacity(opacity);
  return settings;
});
ipcMain.handle('widget:set-display', (_e, patch) => {
  const allowed = {};
  if ([5,7].includes(Number(patch.visibleDays))) allowed.visibleDays = Number(patch.visibleDays);
  if (Number.isInteger(Number(patch.dayStartHour))) allowed.dayStartHour = Math.max(0, Math.min(20, Number(patch.dayStartHour)));
  if (Number.isInteger(Number(patch.dayEndHour))) allowed.dayEndHour = Math.max(4, Math.min(24, Number(patch.dayEndHour)));
  if (Array.isArray(patch.selectedCalendars)) allowed.selectedCalendars = patch.selectedCalendars;
  return saveSettings(allowed);
});
ipcMain.handle('widget:minimize', () => mainWindow?.minimize());
ipcMain.handle('widget:close', () => mainWindow?.close());
ipcMain.handle('widget:open-link', (_e, url) => shell.openExternal(url));

ipcMain.handle('google:status', googleStatus);
ipcMain.handle('google:connect', connectGoogle);
ipcMain.handle('google:authorize-write', authorizeGoogleWrite);
ipcMain.handle('google:disconnect', () => {
  oauthClient = null;
  for (const name of ['google-token.secure.json', 'google-credentials.secure.json']) {
    try { fs.unlinkSync(userFile(name)); } catch {}
  }
  return { connected: false };
});
ipcMain.handle('google:list-calendars', listGoogleCalendars);
ipcMain.handle('google:list-event-colors', listGoogleEventColors);
ipcMain.handle('google:get-events', (_e, args) => fetchGoogleEvents(args));
ipcMain.handle('google:create-event', (_e, payload) => createGoogleEvent(payload));
ipcMain.handle('google:update-event', (_e, payload) => updateGoogleEvent(payload));
ipcMain.handle('google:delete-event', (_e, payload) => deleteGoogleEvent(payload));
