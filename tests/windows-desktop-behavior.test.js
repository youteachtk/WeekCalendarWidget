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

test('auto-arranged desktop icons are reflowed around the entire widget exclusion area', () => {
  assert.match(source, /ArrangeAutoIconsAroundWidget\s*\(/, 'DesktopHost must have a full auto-arrange reflow path');
  assert.match(
    source,
    /if\s*\(state\.AutoArrange\)[\s\S]{0,500}ArrangeAutoIconsAroundWidget/,
    'Auto-arrange layouts must reflow all icons around the reserved widget area'
  );
});

test('icon reservation reflows the whole desktop grid even when Windows auto-arrange was off', () => {
  assert.match(source, /ArrangeIconsAroundWidget\s*\(/, 'reservation should use one full-grid reflow path');
  assert.match(
    source,
    /var\s+moved\s*=\s*ArrangeIconsAroundWidget\(listView,\s*state\.Positions,\s*candidates,\s*currentCount\)/,
    'all saved icon positions should be reflowed through free cells around the widget'
  );
});
