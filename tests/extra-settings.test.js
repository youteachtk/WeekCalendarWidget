const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeExtraSettings } = require('../electron/extra-settings');

const defaults = {
  desktopMode: true,
  reserveIconSpace: false,
  reserveIconSpaceExplicitlyEnabled: false,
  lockWidget: false,
  theme: 'dark'
};

test('legacy persisted reserveIconSpace=true is preserved during migration', () => {
  const actual = normalizeExtraSettings({
    desktopMode: true,
    reserveIconSpace: true,
    lockWidget: false,
    theme: 'dark'
  }, defaults);

  assert.equal(actual.reserveIconSpace, true);
  assert.equal(actual.reserveIconSpaceExplicitlyEnabled, true);
});

test('explicit user opt-in preserves icon reservation across restarts', () => {
  const actual = normalizeExtraSettings({
    desktopMode: true,
    reserveIconSpace: true,
    reserveIconSpaceExplicitlyEnabled: true
  }, defaults);

  assert.equal(actual.reserveIconSpace, true);
  assert.equal(actual.reserveIconSpaceExplicitlyEnabled, true);
});
