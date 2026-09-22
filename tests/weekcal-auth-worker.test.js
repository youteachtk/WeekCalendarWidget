const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const worker = fs.readFileSync(path.join(__dirname, '..', 'worker', 'src', 'index.js'), 'utf8');

test('WeekCal Worker validates Google identity and access tokens for the correct OAuth client', () => {
  assert.match(worker, /oauth2\.googleapis\.com\/tokeninfo\?id_token=/);
  assert.match(worker, /oauth2\.googleapis\.com\/tokeninfo\?access_token=/);
  assert.match(worker, /assertAudience/);
  assert.match(worker, /GOOGLE_CLIENT_ID/);
});

test('bootstrap admins are stored only as hashes in public source', () => {
  assert.match(worker, /BOOTSTRAP_ADMIN_HASHES/);
  assert.match(worker, /crypto\.subtle\.digest\('SHA-256'/);
  assert.doesNotMatch(worker, /arturo\.mendez@prefecomelchorocampo\.edu\.mx/i);
  assert.doesNotMatch(worker, /youteach\.tk@gmail\.com/i);
  assert.doesNotMatch(worker, /arturomendezk2@gmail\.com/i);
});

test('Worker checks allowlist before granting application access and supports admin changes', () => {
  assert.match(worker, /allow:/);
  assert.match(worker, /admin:/);
  assert.match(worker, /\/api\/check-identity/);
  assert.match(worker, /\/api\/check-access/);
  assert.match(worker, /\/api\/admin\/users/);
  assert.match(worker, /request\.method === 'POST'/);
  assert.match(worker, /request\.method === 'DELETE'/);
});

test('legacy Calendar-only tokens can still identify their account through the primary calendar', () => {
  assert.match(worker, /calendar\/v3\/users\/me\/calendarList/);
  assert.match(worker, /find\(item => item\.primary\)/);
});
