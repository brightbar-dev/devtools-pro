# Measurement units and gradient generator

Both features are in this branch. Remove `REPORT.md` and `report-assets/` before merge.

## What was built

### 1. Measure units (`utils/units.ts`)
- Units: px, rem, em, pt, cm, mm, in. Conversions use the CSS reference pixel (96px = 1in = 2.54cm = 25.4mm = 72pt).
- rem divides by the page's computed root font size. em divides by the measured element's font size (for the drag ruler, the element the drag started on). The panel adds a note saying what 1em / 1rem is in px.
- Applied to every length the Measure tool shows: the hover size label, the anchor label, distance-guide labels, the drag-ruler label and hint, and every panel row (size, position, distance to parent, "To anchor"). Pixels still read as whole numbers in the panel, so nothing changes for existing users.
- Switching: **U** cycles the unit while Measure is active, or press the "Unit: …" button in the on-page tool bar. The options page has a select too.
- Persistence: `storage.local.measureUnit`. The tool reads it on start and follows `storage.onChanged`, so changing it on the options page updates an open inspector.
- Decimals per unit: px 1, rem 2, em 2, pt 1, cm 2, mm 1, in 3. If rem/em has no usable font size, the value falls back to px.

### 2. Gradient generator (Color Picker, **G** or the "Gradient" tool-bar button)
- Linear (angle number + slider) and radial (circle/ellipse).
- Stops: add (button, or double-click the bar), remove (button or Delete/Backspace), drag. 2 to 12 stops. A new stop takes the colour the gradient already shows at that point.
- Keyboard: each handle is `role="slider"` and a tab stop, with `aria-valuenow`/`aria-valuetext`. ←/↓ and →/↑ move 1% (Shift 10%), PageUp/PageDown 10%, Home 0%, End 100%, Delete removes. Number and colour inputs in the stop list do the same without dragging. Add/remove/copy results go to an `aria-live` status line. Focus moves to the new or neighbouring stop after add/remove.
- Colours: per-stop colour input, **Pick from screen** (the native EyeDropper, which also feeds the recent list), and the recent-picks swatches, which apply to the selected stop. History comes from the same `recentColors` list the eyedropper already keeps.
- Output: `background-image: linear-gradient(90deg, #4f46e5 0%, #06b6d4 100%);` and a Tailwind arbitrary value `bg-[linear-gradient(90deg,#4f46e5_0%,#06b6d4_100%)]`, via the existing `arbitrary()` helper in `utils/tailwind.ts`. Each has a copy button, and the code is shown and selectable.
- Live preview and the stop bar are painted through CSSOM, so a page CSP that blocks `style` attributes does not affect them. The editor lives inside the existing closed shadow root; no new permission.

## Versus the competitors

**Page Ruler / Dimensions.** Their reviewers ask for cm and pt; both are here along with mm, in, rem and em. Differences: the unit persists, it switches mid-measure with one key, rem/em are tied to the real computed font sizes, and the same unit applies to distances between elements. Not matched: they can measure on a screenshot-style overlay with a ruler along the page edges; this tool has no edge rulers.

**ColorZilla gradient generator.** Matched: linear/radial, stop add/remove/drag, angle, live preview, CSS output, picking stop colours from the page. Added: Tailwind output, keyboard-operable stops with ARIA slider semantics, recent-picks history. Not matched (see "Left undone"): alpha stops, radial position and size, a preset library, importing an existing gradient from the page, vendor-prefixed output.

## Evidence

`tests/e2e/measure-gradient.e2e.mjs` (30 checks) drives the built extension in Chromium 141: cycles units with U and checks 192px = 12rem / 9.6em (20px font) / 144pt / 5.08cm, a 96 × 48px drag reads 2.54 × 1.27cm, the unit survives a reload, then opens the gradient panel and exercises ←/→, Shift+→, Home/End, Add, Delete, the two-stop floor, mouse drag, angle typing, radial and the Tailwind output.

Screenshots: `report-assets/measure-cm.png`, `gradient-linear.png`, `gradient-radial.png`.

How the e2e starts a tool: this Chromium has no `Extensions.triggerAction` (store/capture uses a Chrome for Testing build for that), so the script runs against a throwaway copy of the build with `host_permissions` added, and injects the same `content.js` and sends the same `dtp:activate` message the popup does. The shipped manifest is unchanged (permissions are still `activeTab`, `storage`, `scripting`; no host permissions). The e2e is a manual script, not part of `pnpm test`, as CLAUDE.md already says the on-page UI is verified by hand.

## Validation

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | OK (cloud-install hook) |
| `pnpm exec tsc --noEmit` | 0 errors |
| `pnpm test` | 40 files, 562 tests passed (was 38 files / 525 tests before; +`units.test.ts` 14, +`gradient.test.ts` 22, +1 in `tools.test.ts`) |
| `pnpm exec wxt build` | OK, 200.09 kB |
| `pnpm exec wxt build --browser firefox` | OK, 199.98 kB |
| `node tests/e2e/measure-gradient.e2e.mjs` | 30/30 checks passed |

The e2e command was run as `CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.mjs node tests/e2e/measure-gradient.e2e.mjs`.

## Decisions

- UI strings: the repo routes only the manifest name and description through `_locales`; every in-page and popup string is a literal in the source. The new strings follow that, so nothing was added to `_locales`.
- Tailwind output was added because the repo already has Tailwind copy.
- The on-page panel is one dark theme in this repo (`assets/inspector.css`, no light variant), so the gradient editor matches it. Text and control colours reuse the existing panel palette. The options-page control follows that page's existing light/dark tokens.
- No new dependency, no manifest change, no workflow/version/CHANGELOG edits. Welcome-page keys and `store/cws.json` text were updated to mention G and U (CWS text is only a draft until uploaded by hand).
- `CLAUDE.md` was not edited. It should gain a line each for `utils/units.ts` and `utils/gradient*.ts` when this merges.

## Left undone

- Gradient alpha stops, radial centre/size, presets, and reading a gradient already on the page. Each is a contained follow-up in `utils/gradient.ts`; colours are `#rrggbb` only today.
- A popup-side unit control. The unit is set from the Measure tool bar and the options page.
- With four Color Picker actions plus a pinned-panel hint, the tool bar scrolls horizontally in windows under about 1100px wide (its existing overflow behaviour).
- Real toolbar-click verification (`Extensions.triggerAction`): not possible in this sandbox's Chromium; see Evidence.
