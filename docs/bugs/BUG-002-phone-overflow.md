# BUG-002: Settings page was wider than a phone screen

Symptom: On a 375 px wide phone, the Settings page scrolled sideways and "Save settings" was cut off.

Repro steps: open Settings at 375 px width.

Root cause: `<fieldset>` elements and grid items refuse to shrink below their content's minimum width by default. The two date inputs side by side made each section 373 px wide inside a 343 px space.

Fix: `min-width: 0` on fieldsets, grid items and inputs, and `minmax(0, 1fr)` grid columns (`web/src/styles.css`).

Verification: a script measured `scrollWidth - clientWidth` on every tab at 375 px. All five are now 0.

## Log
- 2026-11-12: Found with a phone-sized viewport in the browser. Fixed and re-measured all tabs.
