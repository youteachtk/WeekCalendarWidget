function normalizeExtraSettings(raw = {}, defaults = {}) {
  const merged = { ...defaults, ...(raw || {}) };
  const explicit = raw?.reserveIconSpaceExplicitlyEnabled === true;
  if (!explicit) {
    merged.reserveIconSpace = false;
    merged.reserveIconSpaceExplicitlyEnabled = false;
  }
  return merged;
}

module.exports = { normalizeExtraSettings };
