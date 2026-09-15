# DevTools Pro — Browser Extension

## What This Is
All-in-one developer browser toolkit: CSS inspection, color picking, font detection, spacing visualization, element info, page meta, screenshots, accessibility, CSS variables, rulers, grid overlay, and page assets. All 12 tools are free.

Built with [WXT](https://wxt.dev/) — builds for Chrome (MV3) and Firefox (MV2) from one codebase.

## Architecture
- **entrypoints/content.ts** — The on-page inspector. Not a manifest content script: it is `registration: 'runtime'` (with no `matches`, which WXT would turn into host permissions) and the popup injects it with `scripting.executeScript` into the tab the user opened the popup on. Hover tools inject into every frame. It draws the outline, floating panel and tool bar inside a closed shadow root on a `<dtp-inspector>` host, and answers the popup's page collectors (meta, CSS variables, accessibility, assets).
- **entrypoints/background.ts** — Service worker: tab capture, settings storage, and the relay that carries a tool switch, exit or pin from one frame to every frame of its tab.
- **entrypoints/popup/** — Tool launcher: 3x4 grid of tool buttons, popup panels for the page tools, a notice on pages the browser does not let extensions touch. Dark/light theme.
- **entrypoints/options/** — Settings page (theme, compact mode).
- **utils/tools.ts** — Tool definitions and kinds (`hover`, `page`, `capture`); `getTool`/`getHoverTool` throw `UnknownToolError` for ids that are not tools.
- **utils/inspect.ts** — Panel content for the hover tools, built from `InspectTarget` (a DOM-free view of an element) into a plain `PanelModel`.
- **utils/panel-render.ts** — `PanelModel` → escaped HTML; style values are vetted and carried in `data-dtp-style`.
- **utils/messages.ts** — Message shapes between popup, background and inspector; validation of frame postMessage traffic.
- **utils/geometry.ts** — Rects, frame offsets, and panel placement that never covers the hovered element.
- **utils/schedule.ts** — Coalesces events to one run per animation frame.
- **utils/restrictions.ts** — Whether the browser allows extensions on a page, from its URL or the injection error.
- **utils/colors.ts** — Color parsing (hex, rgb, hsl, named), conversion, WCAG contrast ratio and rating.
- **utils/css.ts** — CSS property categorization (7 categories), default value detection, formatting.
- **utils/fonts.ts** — Font stack parsing, weight naming, shorthand generation.
- **utils/spacing.ts** — Box model measurement, px parsing, sides formatting.
- **utils/dom.ts** — Element selector generation, composed-path formatting, meta tag categorization.
- **utils/css-vars.ts** — CSS custom property extraction, categorization, filtering.
- **utils/assets.ts** — Page asset collection (images, scripts, stylesheets, fonts).
- **utils/accessibility.ts** — Accessibility analysis (headings, landmarks, ARIA, alt text, labels).
- **assets/inspector.css** — The inspector's shadow-root stylesheet, imported `?inline` and adopted as a constructed sheet.

## Key Implementation Details
- **No host permissions, nothing runs until asked.** The manifest has `activeTab`, `storage` and `scripting` only, and no content script, so installing shows no "read and change all your data" warning and pages where no tool was picked carry no inspector code. Clicking the toolbar icon grants `activeTab` for that tab; picking a tool injects. After a navigation the grant is gone until the icon is clicked again.
- **Isolation.** Everything drawn on a page lives in a closed shadow root. The host's inline `!important` styles beat page CSS, the sheet is adopted (not subject to page CSP), and panel swatches and font previews are applied through CSSOM because CSP can block `style` attributes. The host is shown in the top layer (popover) so page dialogs do not cover it.
- **Hover.** Pointer moves are coalesced to one update per animation frame. The same element is not rebuilt; builders read only the properties their tool shows.
- **Frames.** A same-origin frame's inspector posts hover reports (rect plus `PanelModel`) to its parent, which checks the sender is one of its own frame elements, translates the rect, and draws in the top document. `activeTab` covers the top origin only, so cross-origin frames are not injected; their frame element is still inspectable.
- **Shadow DOM.** Hit-testing descends through open and closed shadow roots (`chrome.dom.openOrClosedShadowRoot`, Firefox `openOrClosedShadowRoot`), and the panel shows the composed path with `#shadow-root` and frame boundaries.
- **Controls.** Esc exits in every frame; clicking the page pins the panel (click again to release); the on-page tool bar switches hover tools and closes; clicking a value copies it (with a selection-copy fallback when the Clipboard API is refused).
- **Loud failures.** An unknown tool id throws `UnknownToolError` instead of showing the CSS panel. Restricted pages (`chrome://`, the Web Store, file URLs without file access) get a plain explanation in the popup.
- **Messaging.** Listeners reply through `sendResponse` (and `return true` when async), which every supported Chrome and Firefox version handles.
- Box model visualization with nested colored layers (margin/border/padding/content); WCAG contrast between text color and background; CSS properties organized by category with defaults hidden; font preview renders in the detected font.

## More tool notes
- **Screenshot**: Uses `browser.tabs.captureVisibleTab()`, auto-downloads as PNG
- **Accessibility**: Content script collects heading structure, landmarks, ARIA roles, alt text, form labels, tabindex; utils analyze and generate issue report with severity levels
- **CSS Variables**: Extracts all `--` properties from page stylesheets (same-origin), groups by scope, color swatches for color values, click to copy
- **Rulers**: Hover-based measurement showing element dimensions, distance to parent, sibling gaps
- **Grid Overlay**: Inspect grid/flexbox properties on containers; show child flex/grid item properties for non-container elements
- **Page Assets**: Lists images, scripts, stylesheets, fonts used on the page

## Monetization
- Free for everyone: all 12 tools (CSS Inspector, Color Picker, Font Detector, Spacing, Element Info, Page Meta, Screenshot, Accessibility, CSS Variables, Rulers, Grid Overlay, Page Assets). No payment code ships in the package.
- Ruling (Ken, 2026-09-15): keep the whole extension free for now; a Pro tier may come later. Sunk cost — no hosting/server bills to recoup. If a paid tier is added, see brightbar-dev/org-work `RUNBOOK.md` § "Adding a paid tier later" for the checklist (ExtensionPay registration, re-adding `wxt-extpay`, CWS Payments toggle, etc.).

## Commands
```bash
npm run dev          # Dev mode with HMR (Chrome)
npm run dev:firefox  # Dev mode (Firefox)
npm run build        # Production build (Chrome)
npm run build:firefox # Production build (Firefox)
npm run zip          # Build + zip for store submission
npm run test         # Run Vitest tests
npm run test:watch   # Watch mode
```

## Testing
```bash
npm test            # Vitest unit tests
npx tsc --noEmit    # type check (CI runs it too)
```
- Logic lives in `utils/` and is tested in Node without a DOM (run `npm test` for the current count). `background.test.ts` uses `wxt/testing/fake-browser` to exercise the message handlers and the frame relay.
- The content script and popup are verified by hand in Chrome for Testing for each PR; the PR body records what was checked and the before/after evidence. Chrome's `Extensions.triggerAction` (CDP, with `--enable-unsafe-extension-debugging`) clicks the toolbar icon for real, so the `activeTab` grant can be exercised headless. Verify install warnings with `chrome.management.getPermissionWarningsByManifest` from any extension page.

## Conventions
- WXT framework with vanilla TypeScript (no UI framework)
- Version: semver, 0.2.x (CWS-submitted), 1.x = production-ready
- Conventional commits: feat:, fix:, chore:
- Do NOT add Claude/AI as co-author or contributor
