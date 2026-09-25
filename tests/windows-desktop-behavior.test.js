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

test('desktop reservation reflows the current Explorer layout around WeekCal', () => {
  assert.match(source, /ArrangeIconsAroundWidget\(listView,\s*currentPositions,\s*candidates,\s*currentCount\)/);
  assert.match(source, /CorrectRemainingOverlaps\s*\(/);
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


test('icon reservation uses the original 0.4.6 grid anchor before verification', () => {
  assert.match(source, /var first = state\.Positions/);
  assert.match(source, /anchorX = \(\(first\.X % spacing\.X\) \+ spacing\.X\) % spacing\.X/);
  assert.match(source, /anchorY = \(\(first\.Y % spacing\.Y\) \+ spacing\.Y\) % spacing\.Y/);
});

test('candidate icon cells cover the Explorer desktop grid', () => {
  assert.match(source, /for \(var x = anchorX; x < client\.Right; x \+= spacing\.X\)/);
  assert.match(source, /for \(var y = anchorY; y < client\.Bottom; y \+= spacing\.Y\)/);
});


test('widget client rectangle is mapped directly into Explorer coordinates before reflow', () => {
  assert.match(source, /GetWidgetAreaInListView\s*\(widget,\s*listView\)/);
  assert.match(source, /GetClientRect\(widget,\s*out var local\)/);
  assert.match(source, /MapWindowPoints\(widget,\s*listView,\s*points,\s*2\)/);
});

test('old icon reservation snapshots are invalidated before the DPI-aware reflow algorithm', () => {
  assert.match(source, /public int Version \{ get; set; \} = 5/);
  assert.match(source, /existing\.Version >= 5/);
  assert.match(source, /existingValid/);
});

test('DesktopHost uses Per-Monitor-V2 DPI awareness before reading window coordinates', () => {
  assert.match(source, /DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2/);
  assert.match(source, /SetProcessDpiAwarenessContext\(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2\)/);
  assert.match(source, /GetDpiForWindow\(hwnd\)/);
});

test('attach keeps the actual native pixel size instead of Electron DIP arguments', () => {
  assert.match(source, /GetWindowRect\(hwnd,\s*out var beforeAttach\)/);
  assert.match(source, /actualWidth = Math\.Max\(1, beforeAttach\.Right - beforeAttach\.Left\)/);
  assert.match(source, /SetWindowPos\(hwnd,[\s\S]{0,300}actualWidth, actualHeight/);
});
