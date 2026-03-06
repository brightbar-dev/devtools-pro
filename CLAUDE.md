# DevTools Pro — Browser Extension

## What This Is
All-in-one developer browser toolkit: CSS inspection, color picking, font detection, spacing visualization, element info, and page meta. Free tier with 6 tools, Pro tier with 6 more (screenshots, accessibility, CSS variables, rulers, grid overlay, page assets).

Built with [WXT](https://wxt.dev/) — builds for Chrome (MV3) and Firefox (MV2) from one codebase.

## Architecture
- **entrypoints/content.ts** — Content script injected on all pages. Provides inspector overlay and floating info panel. Supports multiple tool modes (CSS, color, font, spacing, element info). All injected elements use `dtp-` prefix.
- **entrypoints/background.ts** — Service worker for tab capture, settings storage, tool state management.
- **entrypoints/popup/** — Tool launcher dashboard. 3x4 grid of tool buttons, meta panel view, pro upsell. Dark/light theme.
- **entrypoints/options/** — Settings page (theme, compact mode, license status).
- **utils/colors.ts** — Color parsing (hex, rgb, hsl, named), conversion, WCAG contrast ratio and rating.
- **utils/css.ts** — CSS property categorization (7 categories), default value detection, formatting.
- **utils/fonts.ts** — Font stack parsing, weight naming, shorthand generation.
- **utils/spacing.ts** — Box model measurement, px parsing, sides formatting.
- **utils/dom.ts** — Element selector generation, path building, meta tag categorization.
- **utils/tools.ts** — Tool definitions, free/pro tier logic.
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

## Monetization
- Free tier: 6 tools (CSS Inspector, Color Picker, Font Detector, Spacing, Element Info, Page Meta)
- Pro tier: 6 tools (Screenshot, Accessibility, CSS Variables, Rulers, Grid Overlay, Page Assets)
- Pricing: $59 one-time or $5/mo (via ExtensionPay, not yet integrated)
- Pro gating via `proUnlocked` flag in `browser.storage.local`

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
- 118 unit tests via Vitest + WXT testing plugin
- 6 test files covering: colors (32), css (21), fonts (17), spacing (16), dom (19), tools (13)
- All pure utility logic, no browser API mocking needed

## Conventions
- WXT framework with vanilla TypeScript (no UI framework)
- Version: semver, 0.1.x (MVP), 1.x = production-ready
- Conventional commits: feat:, fix:, chore:
- Do NOT add Claude/AI as co-author or contributor
