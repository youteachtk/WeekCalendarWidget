const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');

test('Escape closes the settings menu without minimizing or closing WeekCal', () => {
  assert.match(source, /document\.addEventListener\(["']keydown["']/);
  assert.match(source, /e\.key\s*!==\s*["']Escape["']/);
  assert.match(source, /settingsPanel[\s\S]{0,220}toggleSettings\(false\)/);
  const handler = source.match(/document\.addEventListener\(["']keydown["'],[\s\S]*?\n\s*}\);/)?.[0] || '';
  assert.doesNotMatch(handler, /api\.minimize\(|api\.close\(/);
});
