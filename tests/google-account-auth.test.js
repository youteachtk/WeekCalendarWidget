const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.js'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'build-windows.yml'), 'utf8');

test('Google login no longer asks the user to choose an OAuth JSON file', () => {
  assert.doesNotMatch(main, /showOpenDialog[\s\S]{0,500}OAuth/i);
  assert.doesNotMatch(renderer, /Selecciona tus credenciales OAuth/i);
  assert.match(html, /Conectar con Google/);
});

test('WeekCal reuses one private Google desktop client ID for every installation', () => {
  assert.match(main, /google-app-config\.generated\.json/);
  assert.match(workflow, /WEEKCAL_GOOGLE_CLIENT_ID/);
  assert.match(workflow, /vars\.WEEKCAL_GOOGLE_CLIENT_ID/);
  assert.doesNotMatch(workflow, /WEEKCAL_GOOGLE_CLIENT_SECRET/);
  assert.match(workflow, /google-app-config\.generated\.json/);
});

test('private desktop OAuth uses PKCE and can migrate the legacy local client ID', () => {
  assert.match(main, /generateCodeVerifierAsync\s*\(/);
  assert.match(main, /CodeChallengeMethod\.S256/);
  assert.match(main, /ClientAuthentication\.None/);
  assert.match(main, /getLegacyCredentialsRecord/);
  assert.match(main, /legacy\?\.client_id/);
});

test('installed users are never asked to provide OAuth credentials', () => {
  assert.doesNotMatch(main, /showOpenDialog[\s\S]{0,500}OAuth/i);
  assert.doesNotMatch(renderer, /Selecciona tus credenciales OAuth/i);
  assert.match(html, /Conectar con Google/);
});

test('Google account can be switched without mixing calendar selection', () => {
  assert.match(preload, /googleSwitchAccount/);
  assert.match(main, /google:switch-account/);
  assert.match(main, /selectedCalendars:\s*\[\]/);
  assert.match(html, /Cambiar cuenta/);
});

test('OAuth flow verifies state and requests email identity', () => {
  assert.match(main, /crypto\.randomBytes/);
  assert.match(main, /returnedState\s*!==\s*expectedState/);
  assert.match(main, /'openid'/);
  assert.match(main, /'email'/);
  assert.match(main, /accountEmail/);
});

test('refresh tokens require Electron safeStorage', () => {
  assert.match(main, /requireEncryption:\s*true/);
  assert.match(main, /Windows no ofrece almacenamiento seguro/);
});

test('disconnected WeekCal contains no bundled demo timetable', () => {
  assert.doesNotMatch(renderer, /function\s+demoEvents\s*\(/);
  assert.doesNotMatch(renderer, /Robótica|Labo IA|MovApps|Labo Ctrl/);
  assert.match(renderer, /state\.events\s*=\s*\[\]/);
  assert.match(renderer, /Sin conectar/);
});


test('disconnected empty state asks the user to connect Google instead of showing sample events', () => {
  assert.match(html, /id="disconnectedEmptyState"/);
  assert.match(html, /Conecta Google Calendar/);
  assert.match(html, /id="emptyStateConnectGoogle"/);
  assert.match(renderer, /disconnectedEmptyState/);
});


test('legacy Google client ID can be recovered without exposing the old secret', () => {
  assert.match(main, /getLegacyCredentialsRecord/);
  assert.match(main, /clientIdRecoverable/);
  assert.match(main, /google:copy-client-id/);
  assert.match(preload, /googleCopyClientId/);
  assert.match(html, /id="legacyGoogleRecovery"/);
  assert.match(html, /id="copyGoogleClientId"/);
  assert.match(renderer, /googleCopyClientId/);
});

test('Windows installer can be built before the recovered client ID is added to GitHub', () => {
  assert.match(workflow, /building recovery-capable installer/i);
  assert.doesNotMatch(workflow, /if:\s*\$\{\{\s*vars\.WEEKCAL_GOOGLE_CLIENT_ID/);
});


test('desktop loopback redirect uses Google's documented root URI without an extra callback path', () => {
  assert.match(main, /http:\/\/127\.0\.0\.1:\$\{port\}/);
  assert.match(main, /u\.pathname !== '\/'/);
  assert.doesNotMatch(main, /oauth2callback/);
});
