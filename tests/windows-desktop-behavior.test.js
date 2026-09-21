const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'native', 'DesktopHost', 'Program.cs'), 'utf8');

test('Windows 11 24H2+ uses the shell window as the desktop host', () => {
  assert.match(source, /GetShellWindow\s*\(/, 'DesktopHost must query the actual shell window');
  assert.match(source, /GetCurrentMonitorTopologyId/, 'DesktopHost must detect the 24H2+ desktop hierarchy');
  assert.match(source, /ShouldUseShellWindowInsteadOfWorkerW\s*\(/, 'DesktopHost needs an explicit 24H2+ host-selection path');
  assert.match(
    source,
    /ShouldUseShellWindowInsteadOfWorkerW\(\)[\s\S]{0,800}return\s+shell/i,
    '24H2+ must return the shell/Progman host instead of a WorkerW sibling'
  );
});

test('desktop icons are reflowed around the entire widget exclusion area', () => {
  assert.match(source, /ArrangeIconsAroundWidget\s*\(/, 'DesktopHost must have a full desktop-grid reflow path');
  assert.match(
    source,
    /var\s+moved\s*=\s*ArrangeIconsAroundWidget\(listView,\s*state\.Positions,\s*candidates,\s*currentCount\)/,
    'all saved icon positions must be reflowed through free cells around the widget'
  );
});

test('full icon reflow is independent of the original Auto Arrange state', () => {
  assert.doesNotMatch(
    source,
    /if\s*\(state\.AutoArrange\)[\s\S]{0,500}ArrangeIconsAroundWidget/,
    'full reflow must not be limited only to Auto Arrange layouts'
  );
});


test('desktop mode parents WeekCal to the desktop icon surface so Win+D does not hide it', () => {
  assert.match(
    source,
    /if\s*\(command\s*==\s*"attach"\)[\s\S]{0,900}FindDesktopListView\(\)[\s\S]{0,900}SetParent\(hwnd,\s*desktopSurface\)/,
    'attach must use the SysListView32 desktop icon surface as the native parent'
  );
});

test('reserved icon cells use their full width and height when avoiding WeekCal', () => {
  assert.match(source, /CellIntersectsWidget\s*\(/, 'DesktopHost needs full-cell collision testing');
  assert.match(
    source,
    /CellIntersectsWidget\(x,\s*y,\s*spacing\.X,\s*spacing\.Y,\s*(?:widgetArea|exclusionArea)\)/,
    'candidate icon cells must be rejected when any part of their width or height intersects WeekCal'
  );
});


test('icon reservation is verified after Explorer applies positions', () => {
  assert.match(source, /CorrectRemainingOverlaps\s*\(/, 'DesktopHost must re-read and correct icon positions after the first pass');
  assert.match(source, /ReadPositions\(listView\)/, 'verification must use the actual positions reported by Explorer');
  assert.match(source, /remainingOverlaps\s*=\s*0/, 'successful reservation must report zero remaining overlaps');
  assert.match(source, /safetyPaddingX/, 'reservation should keep a safety margin around the widget');
});
