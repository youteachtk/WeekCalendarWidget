const { app, BrowserWindow, ipcMain, shell, safeStorage, screen, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { google } = require('googleapis');
const { OAuth2Client, ClientAuthentication, CodeChallengeMethod } = require('google-auth-library');

const APP_NAME = 'WeekCal Widget';
const DEFAULT_GOOGLE_CLIENT_ID = '761061579107-v9jis3ikqluqo1ghrb16antp1e4qoitv.apps.googleusercontent.com';
const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
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
let authorizationCache = null;

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

function protectJson(obj, { requireEncryption = false } = {}) {
  const raw = JSON.stringify(obj);
  if (safeStorage.isEncryptionAvailable()) {
    return { encrypted: true, value: safeStorage.encryptString(raw).toString('base64') };
  }
  if (requireEncryption) {
    throw new Error('Windows no ofrece almacenamiento seguro para conservar la sesión de Google.');
  }
  return { encrypted: false, value: Buffer.from(raw, 'utf8').toString('base64') };
}

function unprotectJson(record) {
  if (!record?.value) return null;
  const data = Buffer.from(record.value, 'base64');
  let raw;
  if (record.encrypted) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Windows no ofrece almacenamiento seguro para leer la sesión de Google.');
    }
    raw = safeStorage.decryptString(data);
  } else {
    raw = data.toString('utf8');
  }
  return JSON.parse(raw);
}

function saveSecure(name, obj, options = {}) {
  writeJson(userFile(name), protectJson(obj, options));
}

function readSecure(name, { requireEncryption = false } = {}) {
  try {
    const record = readJson(userFile(name), null);
    if (requireEncryption && record?.encrypted !== true) return null;
    return unprotectJson(record);
  } catch {
    return null;
  }
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

function getPackagedGoogleCredentials() {
  const generated = readJson(path.join(__dirname, 'google-app-config.generated.json'), null);
  if (generated?.client_id) {
    return {
      client_id: generated.client_id,
      client_secret: generated.client_secret || ''
    };
  }

  const clientId = process.env.WEEKCAL_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.WEEKCAL_GOOGLE_CLIENT_SECRET || '';
  return clientId ? { client_id: clientId, client_secret: clientSecret } : null;
}

function getWeekCalAuthUrl() {
  const generated = readJson(path.join(__dirname, 'weekcal-auth-config.generated.json'), null);
  const raw = generated?.auth_url || process.env.WEEKCAL_AUTH_URL || '';
  return String(raw).trim().replace(/\/+$/, '');
}

function requireWeekCalAuthUrl() {
  const url = getWeekCalAuthUrl();
  if (!url) throw new Error('El servicio de autorización de WeekCal no está configurado.');
  return url;
}

async function authServiceRequest(pathname, {
  method = 'POST',
  body = null,
  accessToken = ''
} = {}) {
  const base = requireWeekCalAuthUrl();
  const headers = { 'content-type': 'application/json' };
  if (accessToken) headers.authorization = 'Bearer ' + accessToken;

  const response = await fetch(base + pathname, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body)
  });

  let data = {};
  try { data = await response.json(); } catch {}

  if (!response.ok) {
    throw new Error(data?.error || (response.status === 403
      ? 'Esta cuenta no está autorizada para usar WeekCal.'
      : 'No se pudo validar el acceso a WeekCal.'));
  }

  return data;
}

function getLegacyCredentialsRecord() {
  return readSecure('google-credentials.secure.json');
}

function getCredentialsRecord() {
  const legacy = getLegacyCredentialsRecord();
  if (legacy?.client_id) {
    return {
      client_id: legacy.client_id,
      client_secret: legacy.client_secret || ''
    };
  }

  const packaged = getPackagedGoogleCredentials();
  return packaged?.client_id ? { client_id: packaged.client_id } : null;
}

function getTokenRecord() {
  const token = readSecure('google-token.secure.json');
  if (!token) return null;

  // Migrate tokens written by older WeekCal builds instead of rejecting them.
  try {
    const record = readJson(userFile('google-token.secure.json'), null);
    if (record?.encrypted !== true && safeStorage.isEncryptionAvailable()) {
      saveSecure('google-token.secure.json', token, { requireEncryption: true });
    }
  } catch {}

  return token;
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

function createOAuthClient(credentials, redirectUri, { persistTokens = true } = {}) {
  const client = credentials.client_secret
    ? new google.auth.OAuth2(credentials.client_id, credentials.client_secret, redirectUri)
    : new OAuth2Client({
        clientId: credentials.client_id,
        redirectUri,
        clientAuthentication: ClientAuthentication.None
      });

  if (persistTokens) {
    const token = getTokenRecord();
    if (token) client.setCredentials(token);
    client.on('tokens', (tokens) => {
      const merged = { ...(getTokenRecord() || {}), ...tokens };
      saveSecure('google-token.secure.json', merged, { requireEncryption: true });
    });
  }

  return client;
}

async function ensureOAuthClient() {
  if (oauthClient) return oauthClient;
  const creds = getCredentialsRecord();
  if (!creds) return null;
  oauthClient = createOAuthClient(creds, 'http://127.0.0.1');
  return oauthClient;
}

async function ensureAuthorizedOAuthClient({ force = false } = {}) {
  const client = await ensureOAuthClient();
  if (!client) return null;

  const now = Date.now();
  if (!force && authorizationCache?.expiresAt > now) return client;

  const access = await client.getAccessToken();
  const accessToken = typeof access === 'string' ? access : access?.token;
  if (!accessToken) throw new Error('La sesión de Google ya no es válida.');

  const auth = await authServiceRequest('/api/check-access', {
    body: { accessToken }
  });

  authorizationCache = {
    email: String(auth.email || ''),
    admin: Boolean(auth.admin),
    expiresAt: now + 5 * 60 * 1000
  };

  return client;
}

async function getAuthorizedAccessToken() {
  const client = await ensureAuthorizedOAuthClient();
  if (!client) throw new Error('Google Calendar no está conectado.');
  const access = await client.getAccessToken();
  const token = typeof access === 'string' ? access : access?.token;
  if (!token) throw new Error('La sesión de Google ya no es válida.');
  return token;
}

async function getConnectedGoogleEmail(client) {
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const res = await oauth2.userinfo.get();
    if (res.data.email) return res.data.email;
  } catch {}

  try {
    const cal = google.calendar({ version: 'v3', auth: client });
    const res = await cal.calendarList.list({ maxResults: 250, showHidden: true });
    return (res.data.items || []).find(item => item.primary)?.id || '';
  } catch {
    return '';
  }
}

async function performOAuthGrant(credentials, {
  scopes,
  selectAccount = true,
  loginHint = '',
  persistTokens = false,
  accessType = 'offline',
  prompt = ''
} = {}) {
  return new Promise((resolve, reject) => {
    const expectedState = crypto.randomBytes(24).toString('hex');
    let pkce = null;
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      try { server.close(); } catch {}
      fn(value);
    };

    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1');
        const expectedPath = '/';
        if (u.pathname !== expectedPath && !(expectedPath === '/' && u.pathname === '')) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const code = u.searchParams.get('code');
        const err = u.searchParams.get('error');
        const errDescription = u.searchParams.get('error_description');
        const returnedState = u.searchParams.get('state');

        if (returnedState !== expectedState) {
          throw new Error('La respuesta de Google no corresponde al inicio de sesión actual.');
        }
        if (err) throw new Error(errDescription ? `${err}: ${errDescription}` : err);
        if (!code) throw new Error('Google no devolvió el código de autorización.');

        const port = server.address().port;
        const redirectUri = `http://127.0.0.1:${port}`;

        const client = createOAuthClient(credentials, redirectUri, { persistTokens: false });

        let tokenResult;
        if (useLegacyDesktopCredentials) {
          tokenResult = await client.getToken(code);
        } else {
          if (!pkce?.codeVerifier) throw new Error('No se pudo validar el inicio de sesión seguro con Google.');
          tokenResult = await client.getToken({
            code,
            codeVerifier: pkce.codeVerifier,
            redirect_uri: redirectUri,
            client_id: credentials.client_id
          });
        }

        const tokens = tokenResult.tokens || {};
        client.setCredentials(tokens);

        if (persistTokens) {
          saveSecure('google-token.secure.json', tokens, { requireEncryption: true });
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body style="font-family:Segoe UI;padding:40px;background:#111;color:#eee"><h2>WeekCal autorizado</h2><p>Puedes volver a WeekCal.</p></body></html>');
        finish(resolve, { client, tokens });
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(e.message);
        finish(reject, e);
      }
    });

    server.listen(0, '127.0.0.1', async () => {
      try {
        const port = server.address().port;
        const redirectUri = `http://127.0.0.1:${port}`;

        const client = createOAuthClient(credentials, redirectUri, { persistTokens: false });

        const options = {
          access_type: accessType,
          prompt: prompt || (selectAccount ? 'select_account' : 'consent'),
          scope: scopes,
          state: expectedState
        };
        if (loginHint) options.login_hint = loginHint;

        pkce = await client.generateCodeVerifierAsync();
        options.code_challenge = pkce.codeChallenge;
        options.code_challenge_method = CodeChallengeMethod.S256;

        const authUrl = client.generateAuthUrl(options);
        await shell.openExternal(authUrl);
      } catch (e) {
        finish(reject, e);
      }
    });

    server.on('error', e => finish(reject, e));
    setTimeout(() => finish(reject, new Error('El inicio de sesión con Google expiró. Inténtalo de nuevo.')), 180000);
  });
}

async function performAuthorizedOAuth(credentials, { selectAccount = true } = {}) {
  // Installed/desktop apps do not support incremental authorization.
  // Request the complete identity + Calendar scope set in a single Google OAuth flow.
  const grant = await performOAuthGrant(credentials, {
    scopes: GOOGLE_CALENDAR_SCOPES,
    selectAccount,
    accessType: 'offline',
    prompt: selectAccount ? 'select_account consent' : 'consent'
  });

  const identityToken = grant.tokens?.id_token;
  if (!identityToken) throw new Error('Google no devolvió la identidad de la cuenta.');

  const verified = await authServiceRequest('/api/check-identity', {
    body: { idToken: identityToken }
  });

  const accountEmail = String(verified.email || '').toLowerCase();

  const storedTokens = {
    ...grant.tokens,
    weekcalWriteEnabled: true,
    weekcalAccountEmail: accountEmail
  };

  saveSecure('google-token.secure.json', storedTokens, { requireEncryption: true });
  oauthClient = createOAuthClient(credentials, 'http://127.0.0.1');
  oauthClient.setCredentials(storedTokens);
  authorizationCache = {
    email: accountEmail,
    admin: Boolean(verified.admin),
    expiresAt: Date.now() + 5 * 60 * 1000
  };
  saveSettings({ selectedCalendars: [] });

  return {
    connected: true,
    writeEnabled: true,
    accountEmail,
    isAdmin: Boolean(verified.admin)
  };
}

async function connectGoogle() {
  const creds = getCredentialsRecord();
  if (!creds) throw new Error('WeekCal no encontró el Client ID de su integración de Google.');
  return performAuthorizedOAuth(creds, { selectAccount: true });
}

async function switchGoogleAccount() {
  oauthClient = null;
  authorizationCache = null;
  try { fs.unlinkSync(userFile('google-token.secure.json')); } catch {}
  saveSettings({ selectedCalendars: [] });
  return connectGoogle();
}

async function authorizeGoogleWrite() {
  const creds = getCredentialsRecord();
  if (!creds) throw new Error('WeekCal no encontró el Client ID de su integración de Google.');
  return performAuthorizedOAuth(creds, { selectAccount: false });
}

function tokenHasWriteScope() {
  const token = getTokenRecord();
  if (token?.weekcalWriteEnabled === true) return true;
  const scope = String(token?.scope || '');
  return scope.includes('/auth/calendar.events') || /\/auth\/calendar(?:\s|$)/.test(scope);
}

async function googleStatus() {
  const legacy = getLegacyCredentialsRecord();
  const packaged = legacy?.client_id ? null : getPackagedGoogleCredentials();
  const creds = legacy?.client_id
    ? { client_id: legacy.client_id, client_secret: legacy.client_secret || '' }
    : (packaged?.client_id ? { client_id: packaged.client_id } : null);
  const token = getTokenRecord();
  const integrationSource = legacy?.client_id ? 'legacy' : (packaged?.client_id ? 'packaged' : 'none');
  if (!creds || !token) return {
    connected: false,
    integrationSource,
    clientIdRecoverable: integrationSource === 'legacy'
  };
  try {
    const client = await ensureAuthorizedOAuthClient();
    const cal = google.calendar({ version: 'v3', auth: client });
    const res = await cal.calendarList.list({ maxResults: 1 });
    const accountEmail = await getConnectedGoogleEmail(client);
    return {
      connected: true,
      calendarsKnown: Boolean(res.data.items?.length),
      writeEnabled: tokenHasWriteScope(),
      accountEmail: authorizationCache?.email || accountEmail,
      isAdmin: Boolean(authorizationCache?.admin),
      integrationSource,
      clientIdRecoverable: integrationSource === 'legacy'
    };
  } catch (e) {
    return { connected: false, error: e.message };
  }
}

async function listAuthorizedWeekCalUsers() {
  const accessToken = await getAuthorizedAccessToken();
  return authServiceRequest('/api/admin/users', {
    method: 'GET',
    accessToken
  });
}

async function addAuthorizedWeekCalUser(email) {
  const accessToken = await getAuthorizedAccessToken();
  return authServiceRequest('/api/admin/users', {
    method: 'POST',
    accessToken,
    body: { email }
  });
}

async function removeAuthorizedWeekCalUser(email) {
  const accessToken = await getAuthorizedAccessToken();
  return authServiceRequest('/api/admin/users', {
    method: 'DELETE',
    accessToken,
    body: { email }
  });
}

async function listGoogleCalendars() {
  const client = await ensureAuthorizedOAuthClient();
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
  const client = await ensureAuthorizedOAuthClient();
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
  const client = await ensureAuthorizedOAuthClient();
  if (!client) return {};
  const cal = google.calendar({ version: 'v3', auth: client });
  const res = await cal.colors.get();
  return res.data.event || {};
}

async function createGoogleEvent(payload) {
  const client = await ensureAuthorizedOAuthClient();
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
  const client = await ensureAuthorizedOAuthClient();
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
  const client = await ensureAuthorizedOAuthClient();
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
ipcMain.handle('google:copy-client-id', () => {
  const creds = getCredentialsRecord();
  if (!creds?.client_id) throw new Error('No se encontró una integración anterior de Google.');
  clipboard.writeText(creds.client_id);
  return { copied: true };
});
ipcMain.handle('google:connect', connectGoogle);
ipcMain.handle('google:switch-account', switchGoogleAccount);
ipcMain.handle('google:authorize-write', authorizeGoogleWrite);
ipcMain.handle('google:disconnect', () => {
  oauthClient = null;
  authorizationCache = null;
  try { fs.unlinkSync(userFile('google-token.secure.json')); } catch {}
  saveSettings({ selectedCalendars: [] });
  return { connected: false };
});
ipcMain.handle('weekcal-auth:list-users', listAuthorizedWeekCalUsers);
ipcMain.handle('weekcal-auth:add-user', (_e, email) => addAuthorizedWeekCalUser(email));
ipcMain.handle('weekcal-auth:remove-user', (_e, email) => removeAuthorizedWeekCalUser(email));
ipcMain.handle('google:list-calendars', listGoogleCalendars);
ipcMain.handle('google:list-event-colors', listGoogleEventColors);
ipcMain.handle('google:get-events', (_e, args) => fetchGoogleEvents(args));
ipcMain.handle('google:create-event', (_e, payload) => createGoogleEvent(payload));
ipcMain.handle('google:update-event', (_e, payload) => updateGoogleEvent(payload));
ipcMain.handle('google:delete-event', (_e, payload) => deleteGoogleEvent(payload));
