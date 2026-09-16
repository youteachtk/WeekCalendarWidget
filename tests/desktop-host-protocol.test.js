const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'native', 'DesktopHost', 'Program.cs'), 'utf8');

test('LVM_SETITEMPOSITION32 uses a remote POINT pointer instead of packed coordinates', () => {
  assert.match(source, /WriteProcessMemory\s*\(/, 'DesktopHost must write POINT data into Explorer process memory');
  assert.match(
    source,
    /SendMessage\(listView,\s*LVM_SETITEMPOSITION32,\s*new IntPtr\(index\),\s*remote\)/,
    'LVM_SETITEMPOSITION32 lParam must be the remote POINT pointer'
  );
  assert.doesNotMatch(
    source,
    /LVM_SETITEMPOSITION32[^\n]*new IntPtr\(packed\)/,
    'packed x/y coordinates are invalid for LVM_SETITEMPOSITION32'
  );
});
