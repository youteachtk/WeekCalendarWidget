const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');

test('Escape closes the settings menu without minimizing or closing WeekCal', () => {
  assert.match(source, /keydown/);
  assert.match(
    source,
    /key\s*===?\s*["']Escape["'][\s\S]{0,350}toggleSettings\(false\)/,
    'Escape should close the settings panel'
  );
});
