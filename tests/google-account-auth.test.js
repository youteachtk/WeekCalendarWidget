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

test('WeekCal reuses one Google desktop OAuth client configuration for every installation', () => {
  assert.match(main, /google-app-config\.generated\.json/);
  assert.match(workflow, /WEEKCAL_GOOGLE_CLIENT_ID/);
  assert.match(workflow, /vars\.WEEKCAL_GOOGLE_CLIENT_ID/);
  assert.match(workflow, /secrets\.WEEKCAL_GOOGLE_CLIENT_SECRET/);
  assert.match(workflow, /google-app-config\.generated\.json/);
});

test('desktop credentials use a root loopback callback and explicit PKCE token exchange', () => {
  assert.match(main, /new google\.auth\.OAuth2\(credentials\.client_id, credentials\.client_secret, redirectUri\)/);
  assert.doesNotMatch(main, /oauth2callback/);
  assert.match(main, /code_verifier: pkce\.codeVerifier/);
  assert.match(main, /https:\/\/oauth2\.googleapis\.com\/token/);
  assert.match(main, /client_secret/);
});

test('all desktop OAuth grants use PKCE', () => {
  assert.match(main, /generateCodeVerifierAsync\s*\(/);
  assert.match(main, /CodeChallengeMethod\.S256/);
  assert.match(main, /ClientAuthentication\.None/);
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

test('desktop OAuth is a single non-incremental identity and Calendar grant', () => {
  assert.match(main, /GOOGLE_CALENDAR_SCOPES/);
  assert.match(main, /scopes: GOOGLE_CALENDAR_SCOPES/);
  assert.match(main, /check-identity/);
  assert.doesNotMatch(main, /GOOGLE_IDENTITY_SCOPES/);
  assert.doesNotMatch(main, /Stage 1:/);
  assert.doesNotMatch(main, /Stage 2:/);
});

test('legacy Google tokens are accepted and migrated to Electron safeStorage', () => {
  assert.match(main, /const token = readSecure\('google-token\.secure\.json'\)/);
  assert.match(main, /record\?\.encrypted !== true/);
  assert.match(main, /safeStorage\.isEncryptionAvailable\(\)/);
  assert.match(main, /saveSecure\('google-token\.secure\.json', token, \{ requireEncryption: true \}\)/);
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


test('legacy Google integration can be recovered locally while only copying its client ID to the UI', () => {
  assert.match(main, /getLegacyCredentialsRecord/);
  assert.match(main, /clientIdRecoverable/);
  assert.match(main, /google:copy-client-id/);
  assert.match(preload, /googleCopyClientId/);
  assert.match(html, /id="legacyGoogleRecovery"/);
  assert.match(html, /id="copyGoogleClientId"/);
  assert.match(renderer, /googleCopyClientId/);
});

test('Windows installer packages the deployed WeekCal authorization service URL', () => {
  assert.match(workflow, /cloudflare-auth:/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow, /weekcal-auth-config\.generated\.json/);
  assert.match(workflow, /needs\.cloudflare-auth\.outputs\.auth_url/);
});


test('desktop OAuth uses only the documented root loopback callback', () => {
  assert.doesNotMatch(main, /oauth2callback/);
  assert.doesNotMatch(main, /useLegacyDesktopCredentials/);
  assert.match(main, /http:\/\/127\.0\.0\.1:\$\{port\}/);
});


test('fresh installations contain the recovered WeekCal Google client ID', () => {
  assert.match(main, /DEFAULT_GOOGLE_CLIENT_ID\s*=\s*['"]761061579107-v9jis3ikqluqo1ghrb16antp1e4qoitv\.apps\.googleusercontent\.com['"]/);
  assert.match(main, /process\.env\.WEEKCAL_GOOGLE_CLIENT_ID \|\| DEFAULT_GOOGLE_CLIENT_ID/);
});

test('fresh-PC OAuth uses PKCE and supports packaged desktop credentials', () => {
  assert.match(main, /ClientAuthentication\.None/);
  assert.match(main, /generateCodeVerifierAsync\s*\(/);
  assert.match(main, /CodeChallengeMethod\.S256/);
  assert.match(main, /http:\/\/127\.0\.0\.1:\$\{port\}/);
});


test('central allowlist is checked again for connected sessions', () => {
  assert.match(main, /ensureAuthorizedOAuthClient/);
  assert.match(main, /\/api\/check-access/);
  assert.match(main, /authorizationCache/);
  assert.match(main, /getAccessToken\(\)/);
});

test('WeekCal exposes authorized-user administration only through authenticated IPC calls', () => {
  assert.match(main, /weekcal-auth:list-users/);
  assert.match(main, /weekcal-auth:add-user/);
  assert.match(main, /weekcal-auth:remove-user/);
  assert.match(preload, /authListUsers/);
  assert.match(preload, /authAddUser/);
  assert.match(preload, /authRemoveUser/);
  assert.match(html, /id="weekcalAdmin"/);
  assert.match(html, /id="authorizedUserEmail"/);
});


test('installed-app OAuth never sends unsupported incremental authorization', () => {
  assert.doesNotMatch(main, /include_granted_scopes/);
  assert.match(main, /scope:\s*scopes/);
  assert.doesNotMatch(main, /GOOGLE_IDENTITY_SCOPES/);
  assert.match(main, /GOOGLE_CALENDAR_SCOPES/);
});


test('fresh-PC package carries desktop client secret from Actions secret', () => {
  assert.match(main, /generated\.client_secret/);
  assert.match(main, /WEEKCAL_GOOGLE_CLIENT_SECRET/);
  assert.match(workflow, /secrets\.WEEKCAL_GOOGLE_CLIENT_SECRET/);
  assert.match(workflow, /client_secret\s*=\s*\$env:WEEKCAL_GOOGLE_CLIENT_SECRET/);
});
