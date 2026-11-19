// What each check is called in reports, and which kinds stop a deploy when they're new.
// What stops a deploy when it's new. Everything else is filed as an issue and waits for a human.
export const BLOCKING = new Set([
  "h-overflow", "off-screen", "js-error", "console-error", "broken-asset", "third-party-request", "raw-key", "placeholder",
  "bad-value", "screen-failed", "rtl-dir", "lang-attr", "rtl-digits", "broken-image", "axe-critical", "axe-serious",
  "broken-link", "first-run-failed", "state-failed", "data-schema", "data-missing", "data-count", "data-stale", "data-source",
]);
export const LABEL = {
  "h-overflow": "Page scrolls sideways", "off-screen": "Something sticks out past the screen edge", "clipped-text": "Text is cut off",
  "clipped-hint": "Search box hint is cut off", overlap: "Text drawn on top of other text", "tap-target": "Buttons or links smaller than 44px",
  "rtl-digits": "Numbers in the wrong order (right-to-left)", "rtl-dir": "Page isn't right-to-left", "lang-attr": "Wrong page language tag",
  untranslated: "English showing in another language", "raw-key": "Translation key showing instead of words", placeholder: "Unfilled {placeholder}",
  "bad-value": "undefined/NaN on screen", "broken-image": "Image didn't load", "console-error": "Console error", "js-error": "Script error",
  "broken-asset": "Missing file", "third-party-request": "Request to another company's server", "screen-failed": "Screen didn't open",
  "axe-critical": "Accessibility (critical)", "axe-serious": "Accessibility (serious)", "axe-moderate": "Accessibility (moderate)", "axe-minor": "Accessibility (minor)", "axe-target-size": "Tap targets too small or crowded (axe)",
  "broken-link": "Broken link", "external-link": "Outside link may be broken", "visual-diff": "Looks different from the approved screenshot",
  "first-run-failed": "First-run screen didn't work", "state-failed": "Loading/error/empty state didn't work",
  "data-schema": "Listing data is malformed", "data-coords": "Listing pin in the wrong place", "data-duplicate": "Duplicate listings",
  "data-format": "Bad phone, ZIP or web address in listings", "data-hours": "Opening hours not understood", "data-stale": "Listings are out of date",
  "data-count": "Listings count dropped (partial download?)", "data-source": "A data source failed", "data-source-link": "Data source page unreachable",
  "data-dead-link": "Listing website is dead", "data-spotcheck": "Listing differs from its source", "data-missing": "Listing files missing",
  "ux-review": "Ease-of-use review", "user-report": "Reported by a visitor",
};

