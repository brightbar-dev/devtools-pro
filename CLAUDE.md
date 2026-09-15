# DevTools Pro — Browser Extension

## What This Is
All-in-one developer browser toolkit: CSS inspection, color picking, font detection, spacing visualization, element info, page meta, screenshots, accessibility, CSS variables, rulers, grid overlay, and page assets. All 12 tools are free.

Built with [WXT](https://wxt.dev/) — builds for Chrome (MV3) and Firefox (MV2) from one codebase.

## Architecture
- **entrypoints/content.ts** — Content script injected on all pages. Provides inspector overlay and floating info panel. Supports multiple tool modes (CSS, color, font, spacing, element info). All injected elements use `dtp-` prefix.
- **entrypoints/background.ts** — Service worker for tab capture, settings storage, tool state management.
- **entrypoints/popup/** — Tool launcher dashboard. 3x4 grid of tool buttons, meta panel view. Dark/light theme.
- **entrypoints/options/** — Settings page (theme, compact mode).
- **utils/colors.ts** — Color parsing (hex, rgb, hsl, named), conversion, WCAG contrast ratio and rating.
- **utils/css.ts** — CSS property categorization (7 categories), default value detection, formatting.
- **utils/fonts.ts** — Font stack parsing, weight naming, shorthand generation.
- **utils/spacing.ts** — Box model measurement, px parsing, sides formatting.
- **utils/dom.ts** — Element selector generation, path building, meta tag categorization.
- **utils/tools.ts** — Tool definitions, free/pro tier logic.
- **utils/css-vars.ts** — CSS custom property extraction, categorization, filtering.
- **utils/assets.ts** — Page asset collection (images, scripts, stylesheets, fonts).
- **utils/accessibility.ts** — Accessibility analysis (headings, landmarks, ARIA, alt text, labels).
- **assets/inspector.css** — Floating panel styles (dark theme, box model viz, color swatches).

## Key Implementation Details
- Inspector activates via popup tool button, injects overlay + panel on hover
- Escape key deactivates inspector
- Click on color values copies to clipboard
- Box model visualization with nested colored layers (margin/border/padding/content)
- WCAG contrast ratio calculated between text color and background
- CSS properties organized by category, defaults hidden for compact display
- Font preview renders in actual detected font
- All DOM elements prefixed with `dtp-` to avoid host page conflicts

## Pro Tools Implementation
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
npm test
```
- 171 unit tests via Vitest + WXT testing plugin
- 10 test files covering: colors (32), css (21), fonts (17), spacing (16), dom (19), tools (4), css-vars (22), assets (16), accessibility (21), background (3)
- Mostly pure utility logic; background.test.ts uses `wxt/testing/fake-browser` to exercise the message handlers

## Conventions
- WXT framework with vanilla TypeScript (no UI framework)
- Version: semver, 0.2.x (CWS-submitted), 1.x = production-ready
- Conventional commits: feat:, fix:, chore:
- Do NOT add Claude/AI as co-author or contributor
