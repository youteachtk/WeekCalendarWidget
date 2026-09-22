function normalizeExtraSettings(raw = {}, defaults = {}) {
  const merged = { ...defaults, ...(raw || {}) };

  // Preserve the user's existing reservation choice from older WeekCal builds.
  // The explicit flag is only added so future migrations can distinguish a real
  // choice from a default value.
  if (raw?.reserveIconSpace === true) {
    merged.reserveIconSpace = true;
    merged.reserveIconSpaceExplicitlyEnabled = true;
  } else if (raw?.reserveIconSpaceExplicitlyEnabled === true) {
    merged.reserveIconSpace = Boolean(raw?.reserveIconSpace);
    merged.reserveIconSpaceExplicitlyEnabled = true;
  }

  return merged;
}

module.exports = { normalizeExtraSettings };
