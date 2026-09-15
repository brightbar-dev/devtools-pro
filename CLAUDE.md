# DevTools Pro — Browser Extension

## What This Is
All-in-one developer browser toolkit: CSS inspection, color picking, font detection, spacing visualization, element info, page meta, screenshots, accessibility, CSS variables, rulers, grid overlay, and page assets. Plus Live Edit with undo. Every tool is free.

Built with [WXT](https://wxt.dev/) — builds for Chrome (MV3) and Firefox (MV2) from one codebase.

## Architecture
- **entrypoints/content.ts** — The on-page inspector. Not a manifest content script: it is `registration: 'runtime'` (with no `matches`, which WXT would turn into host permissions) and the popup injects it with `scripting.executeScript` into the tab the user opened the popup on. Hover tools inject into every frame. It draws the outline, floating panel and tool bar inside a closed shadow root on a `<dtp-inspector>` host, and answers the popup's page collectors (meta, CSS variables, accessibility, assets).
- **entrypoints/background.ts** — Service worker: tab capture, settings storage, and the relay that carries a tool switch, exit or pin from one frame to every frame of its tab.
- **entrypoints/popup/** — Tool launcher: grid of 13 tool buttons (Live Edit spans the last row), popup panels for the page tools, a notice on pages the browser does not let extensions touch. Dark/light theme.
- **entrypoints/options/** — Settings page (theme, compact panel).
- **entrypoints/welcome/** — First-run page opened on install: what each tool does, the keys, that every tool is free and that the extension only touches the page you click it on.
- **utils/tools.ts** — Tool definitions and kinds (`hover`, `page`, `capture`); `getTool`/`getHoverTool` throw `UnknownToolError` for ids that are not tools.
- **utils/inspect.ts** — Panel content for the hover tools, built from `InspectTarget` (a DOM-free view of an element) into a plain `PanelModel`.
- **utils/panel-render.ts** — `PanelModel` → escaped HTML; style values are vetted and carried in `data-dtp-style`.
- **utils/messages.ts** — Message shapes between popup, background and inspector; validation of frame postMessage traffic.
- **utils/measure.ts** — Distance guides between an anchor and a target box (gaps and insets), drag ruler rect, length labels.
- **utils/overlay-geometry.ts** — Drawn overlay geometry: margin/padding bands, grid tracks/gaps/named areas (with content distribution), flex gaps.
- **utils/icons.ts** — Inline SVG tool icons (no emoji), shared by the popup and the welcome page.
- **utils/grid-nav.ts** — Arrow-key movement across the popup grid, including the full-width last row.
- **utils/font-inventory.ts** — Page fonts as rendered: families with counts, weights and sizes.
- **utils/edits.ts** — Live Edit history: gesture-merged steps, undo/redo, reset element or all (undoable), net changes, changes as CSS.
- **utils/edit-form.ts** — The Live Edit form's state and escaped markup, colour-input and value conversion.
- **utils/capture.ts** — Screenshot tiles for tall captures, device-pixel crops, file names, data-URL decoding.
- **utils/geometry.ts** — Rects, frame offsets, and panel placement that never covers the hovered element.
- **utils/schedule.ts** — Coalesces events to one run per animation frame.
- **utils/restrictions.ts** — Whether the browser allows extensions on a page, from its URL or the injection error.
- **utils/colors.ts** — Color parsing (hex, rgb, hsl, named, and the `oklch`/`oklab`/`lab`/`lch`/`color()` forms Chrome returns for modern CSS), compositing, hex/rgb/hsl/oklch output, WCAG contrast ratio and rating.
- **utils/palette.ts** — Page palette: computed colours grouped by role (backgrounds, text, borders, SVG), counted, as CSS custom properties; recent-picks list.
- **utils/color-panels.ts** — Panel models for the eyedropper result and the page palette.
- **utils/contrast.ts** — Page-wide text contrast: effective background behind text (translucent layers composited, images and gradients flagged for a manual check), WCAG large-text rules, AA/AAA audit.
- **utils/css.ts** — CSS property categorization (7 categories; "Flex & Alignment" shows for flex and grid containers), initial-value detection, `nonDefaultDeclarations` shared by the CSS panel and copy.
- **utils/cascade.ts** — Selector-list splitting, Selectors 4 specificity (`:is`/`:not`/`:has`/`:where`, `nth-child(of)`), which authored declaration wins (importance, inline, specificity, order), shorthand fallback for `var()` longhands.
- **utils/copy-formats.ts** — Copy as a CSS rule (path comment, no redundant shorthands) or Tailwind classes, and the panels showing what was copied.
- **utils/tailwind.ts** — Best-effort computed CSS → Tailwind v3/v4 classes (spacing scale or arbitrary values), with every declaration it cannot map listed rather than dropped.
- **utils/fonts.ts** — Font stack parsing, weight naming, shorthand generation.
- **utils/spacing.ts** — Box model measurement, px parsing, sides formatting.
- **utils/dom.ts** — Element selector generation, composed-path formatting, meta tag categorization.
- **utils/css-vars.ts** — CSS custom property extraction, categorization, filtering.
- **utils/assets.ts** — Page asset collection (images, scripts, stylesheets, fonts).
- **utils/accessibility.ts** — Accessibility analysis (contrast, alt text, labels, headings, landmarks, focus order) with WCAG 2.2 references and highlight groups.
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
- **CSS Inspector**: Computed values by category with initial values hidden (including zero margins/paddings and colours of zero-width borders). Under each value, the authored source when a same-origin rule set it: `var(--space-md) · .grid-demo · site.css`, or `style="" · inline`. Rules come from the element's root (document or shadow root) including adopted sheets, with `@media`/`@supports` evaluated and `@layer`/`@container` flattened; flattened rules are cached per root until the sheets change. Tool-bar actions: **Copy CSS (C)** copies the element's styles as a rule; **Copy Tailwind (T)** copies classes and lists anything not mapped. Both show what was copied in a pinned panel.
- **Font Detector**: Shows the declared family and the one the browser actually renders (a loaded @font-face, or canvas text that measures differently from every generic fallback), sizes in px and rem, weight names. **Page fonts (I)** lists every rendered family with element counts, weights and sizes.
- **Popup**: SVG icons, a description line that follows hover and focus (each button also carries its description for screen readers), arrow keys/Home/End across the grid with Enter to activate, the version from the manifest, and "Every tool free" in the header.
- **Compact panel** (Settings): smaller type, no composed path or rule sources; content scripts follow `storage.onChanged`, so the change applies to an open inspector.
- **Panel placement** avoids both the hovered element and the tool bar.
- **Color Picker**: Hovering shows text, background and border colours in hex, rgb, hsl and oklch. The background is the effective one behind the element: transparent layers are walked out to the first opaque background, and translucent ones are blended. Contrast is shown with AA/AAA for normal and large text; an image or gradient background points to the eyedropper instead. Tool-bar actions: **Eyedropper (E)** uses the native `EyeDropper` API (no permission, secure pages) to sample any pixel, shows it in all formats with contrast on white and black, and keeps recent picks in `storage.local`. **Palette (P)** lists every distinct computed colour on the page by role with use counts; click a swatch to copy, or copy all as CSS custom properties.
- **Tool actions**: A hover tool's `actions` appear in the on-page tool bar with single-key shortcuts (ignored while typing in a field). Panels that are not about an element (palette, eyedropper result) sit above the tool bar and stay pinned until the page is clicked.
- **Live Edit**: Click an element to edit its text (only when it has no child elements), margin and padding per side, text and background colour, and font size. Edits are inline `!important` declarations applied as you type; each focus or drag is one undo step. ⌘/Ctrl+Z undoes and ⇧⌘Z or Ctrl+Y redoes; Reset element and Reset all are themselves undoable; Copy changes as CSS exports the net changes per element with an id or `:nth-of-type` path selector. The history lives in the content script until the page reloads, across tool switches. Keys typed into the form are never treated as tool shortcuts.
- **Screenshot**: The popup offers Visible area (captured by the background, saved and copied from the popup), Full page, and One element. Full page and element captures run in the page (`utils/capture.ts` plans the tiles): scroll with `behavior: 'instant'`, capture each viewport through the background at most twice a second (Chrome's `captureVisibleTab` limit), crop by devicePixelRatio and stitch on an `OffscreenCanvas`, hiding our own UI throughout and fixed/sticky elements after the first tile (from the start for an element). Results download through an anchor in our shadow root (no `downloads` permission), are copied as `image/png` when the page allows, and a toast reports the file and size. Captures stop at 16,000 CSS px. **S** captures the hovered element from any hover tool.
- **Accessibility**: The content script walks the document and every open or closed shadow root. It measures the contrast of each visible text element against its effective background (disabled controls and visually hidden text are skipped; up to 4000 elements), and collects alt text, link/button names, form labels, positive tabindex, heading order and landmarks. Every finding keeps its elements in a registry, so the popup's Highlight buttons outline them on the page (Esc or 8 s clears). Issues carry a WCAG 2.2 reference, marked best practice where it is guidance rather than a failure.
- **CSS Variables**: Extracts all `--` properties from page stylesheets (same-origin), groups by scope, color swatches for color values, click to copy
- **Measure** (tool id `rulers`): Hover draws the element's size on the page. Click anchors an element; holding Alt (Option) over another draws red distance guides with px labels (gaps between boxes, insets when one contains the other) and adds "To anchor" rows to the panel. Dragging on the page draws a ruler rectangle with its size; the next click clears it. Mousedown is swallowed while measuring so text is not selected.
- **Grid Overlay**: Hovering a grid container (or a child of one) draws its column and row tracks with numbers, hatched gaps and named areas; a flex container gets item outlines, hatched gaps and its direction. Click keeps an overlay; several can be kept at once. The panel still lists the layout properties.
- **Spacing**: Hover tints margin (orange), padding (green) and content (blue) on the page, DevTools-style, with values on each side and the content size; the panel keeps the box-model diagram.
- **Drawings** are rebuilt on hover change, scroll and resize in a `drawings` layer of the shadow root; they are drawn for elements of the top document (frame hovers get the outline and panel only).
- **Page Assets**: Lists images, scripts, stylesheets, fonts used on the page

## Monetization
- Free for everyone: all 13 tools (CSS Inspector, Color Picker, Font Detector, Spacing, Element Info, Page Meta, Screenshot, Accessibility, CSS Variables, Measure, Grid Overlay, Page Assets, Live Edit). No payment code ships in the package.
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
