const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const project = fs.readFileSync(path.join(__dirname, '..', 'native', 'DesktopHost', 'DesktopHost.csproj'), 'utf8');
const manifest = fs.readFileSync(path.join(__dirname, '..', 'native', 'DesktopHost', 'app.manifest'), 'utf8');

test('DesktopHost publishes with its DPI awareness manifest', () => {
  assert.match(project, /<ApplicationManifest>app\.manifest<\/ApplicationManifest>/);
  assert.match(manifest, /PerMonitorV2/);
  assert.match(manifest, /true\/pm/);
});
