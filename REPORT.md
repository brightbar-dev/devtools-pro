# Command palette — report

## What was built
- **Open:** bare `/` while any hover tool is on (ignored in text fields and the Live Edit form), or the tool bar's new **Commands** button. `/` collides with none of the tool keys (`S C T E P I`, Esc, Alt, ⌘/Ctrl+Z) and with no browser chord (no modifier). It is documented in the welcome page's key list and CLAUDE.md.
- **Lists:** every hover tool (switch), every tool-bar action with its own key shown (`C T E P I`, `S`), Screenshot full page, Stop inspecting (`Esc`), and the four page tools (Meta, CSS Variables, Accessibility, Assets). The list is built from `TOOLS`, so new tools/actions appear automatically.
- **Filter:** fuzzy, every word must match in any order; prefix and word-start hits rank higher, scattered letters still match; keywords ("wcag", "margin") find tools but never outrank a title match. Matched title letters are bold + underlined (not colour-only).
- **Recent first:** empty query lists recently run commands first (max 8, in `storage.local.recentCommands`, ids re-validated on read); with a query a recent command wins near ties only.
- **Keyboard:** ↑/↓ (wraps), Ctrl+N/P, PageUp/Down, Enter runs, Esc closes only the palette (second Esc exits the tool), Tab is trapped (modal). Focus returns to the previously focused page element on close.
- **A11y:** `role=dialog aria-modal`, input `role=combobox` + `aria-controls`/`aria-activedescendant`, `role=listbox/option` with `aria-selected`, `aria-keyshortcuts` per option, accessible name = title + description, live region announcing the result count, forced-colors outline, selection shown by a bar as well as colour.
- **Theme:** CSS variables for dark, light, and Settings "auto" (follows the system); the Settings theme is read from `storage.local.theme` and updates live. Contrast checked by hand against the palette values (all text ≥ 4.5:1).
- **Hostile pages:** drawn in the existing closed shadow root (adopted sheet, no `style` attributes, so CSP-safe); keys typed in the palette are stopped before page bubble listeners; works inside same-origin frames via a relayed `dtp:palette` message.
- **Free:** no tier/trial/upsell copy; a unit test guards the command text.
- **No new permissions, host permissions or dependencies**; `wxt.config.ts` untouched. i18n: the repo's `_locales` only hold the manifest name/description, in-page UI strings are plain English in code, so no locale files changed.

## Versus the competitors
- **VisBug:** tool switching is by single-key/number hotkeys with no search or discoverability; the palette adds search, shows each command's key, remembers recents, and is screen-reader labelled.
- **Hoverify:** I could not inspect it in this sandbox (offline/paid); I am not claiming parity beyond the brief's bar. Browser DevTools' Cmd+Shift+P menu is the model for the interaction (type, arrows, Enter, Esc).

## Evidence
- `tests/e2e/palette.e2e.mjs` — real Chromium + built extension, on a hostile page (global `!important` styles, strict CSP, page key listeners): 10/10 checks pass (opens, focus moves in, page does not see keys, typing filters, Esc closes only the palette, Enter runs and remembers the command, Esc exits).
- Screenshots (drop `report-evidence/` before merging): `report-evidence/palette-hostile-filtered.png` (query "eyed"), `palette-hostile-empty.png`, `palette-hostile-light-recent.png` (light scheme, Recent section).

## Validation
- `pnpm exec tsc --noEmit` — pass
- `pnpm test` — 39 files, 547 tests pass (new: `tests/commands.test.ts`, 22 tests)
- `pnpm run build` (Chrome MV3) and `pnpm run build:firefox` — pass, manifest permissions unchanged
- e2e: `PLAYWRIGHT=… CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/e2e/palette.e2e.mjs` — all checks passed

## Left undone / limits
- **Only while a tool is on.** The extension injects nothing until asked, so there is no palette on a page where no tool was picked. A popup-side palette would be a separate piece of UI; not built.
- **Page tools can't run from the palette.** Meta, CSS Variables, Accessibility and Assets render in the popup, which an extension cannot open from a page without a new capability. They are listed (searchable) and say they open from the toolbar icon. Screenshot "visible area" is popup-driven for the same reason.
- A page's own modal `<dialog>` that makes the rest of the document `inert` could block focus into the palette; not tested.
- The e2e loads a test copy of the built extension with one added host permission for 127.0.0.1, because this Chromium has no CDP call to click the toolbar icon (the `activeTab` grant). The shipped manifest is unchanged. It is a standalone script (as `store/capture`), not wired into CI, which I was told not to touch.
