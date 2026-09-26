# Changelog

## [0.6.1](https://github.com/brightbar-dev/devtools-pro/compare/devtools-pro-v0.6.0...devtools-pro-v0.6.1) (2026-09-26)


### Bug Fixes

* **colors:** read oklch and lch hues given in grad correctly instead of as radians ([#37](https://github.com/brightbar-dev/devtools-pro/issues/37)) ([4a74ad4](https://github.com/brightbar-dev/devtools-pro/commit/4a74ad4b9cbe78e788f776b2df60567a86509e2e))

## [0.6.0](https://github.com/brightbar-dev/devtools-pro/compare/devtools-pro-v0.5.0...devtools-pro-v0.6.0) (2026-09-24)


### Features

* ask for a store review once, after real use, with a separate link for problems ([#33](https://github.com/brightbar-dev/devtools-pro/issues/33)) ([08d5f54](https://github.com/brightbar-dev/devtools-pro/commit/08d5f540b276c37b08f9fa87370b13f4d47be3ee))

## [0.5.0](https://github.com/brightbar-dev/devtools-pro/compare/devtools-pro-v0.4.0...devtools-pro-v0.5.0) (2026-09-23)


### Features

* rename DevTools Pro to Brightbar DevTools ([#29](https://github.com/brightbar-dev/devtools-pro/issues/29)) ([d879a1c](https://github.com/brightbar-dev/devtools-pro/commit/d879a1cf3f172cad80c6fa7f194ac7a2a5387ebe))

## [0.4.0](https://github.com/brightbar-dev/devtools-pro/compare/devtools-pro-v0.3.0...devtools-pro-v0.4.0) (2026-09-19)


### Features

* accessibility audit with page-wide contrast, WCAG references and highlight on page ([#15](https://github.com/brightbar-dev/devtools-pro/issues/15)) ([d567711](https://github.com/brightbar-dev/devtools-pro/commit/d56771168102ed2638bcc0814522ba6f806f6b0c))
* color picker with effective-background contrast, oklch, eyedropper and page palette ([#16](https://github.com/brightbar-dev/devtools-pro/issues/16)) ([987c184](https://github.com/brightbar-dev/devtools-pro/commit/987c1846485bfc9007f32f99b5d382aab7f941cd))
* CSS inspector shows where values come from and copies as CSS or Tailwind ([#18](https://github.com/brightbar-dev/devtools-pro/issues/18)) ([c47cec8](https://github.com/brightbar-dev/devtools-pro/commit/c47cec8ef8b40be9673587ef6b8a417eb1f55012))
* draw measurements, grid and flex layout, and spacing on the page ([#17](https://github.com/brightbar-dev/devtools-pro/issues/17)) ([77260f6](https://github.com/brightbar-dev/devtools-pro/commit/77260f697d77331312f2ac62b1499506e1d6fd2b))
* first-run page, SVG icons and keyboard navigation, rendered fonts, and panel fixes ([#21](https://github.com/brightbar-dev/devtools-pro/issues/21)) ([c02b965](https://github.com/brightbar-dev/devtools-pro/commit/c02b965f41e4946aac440c978fb74d6a9d774d2f))
* full-page and element screenshots, saved and copied ([#19](https://github.com/brightbar-dev/devtools-pro/issues/19)) ([074bca2](https://github.com/brightbar-dev/devtools-pro/commit/074bca252c662cde1bc2327326b66291e17c1bdc))
* live edit with undo for text, spacing, colours and font size ([#20](https://github.com/brightbar-dev/devtools-pro/issues/20)) ([90a0f39](https://github.com/brightbar-dev/devtools-pro/commit/90a0f396c70f000a52b94ef376e5609e2cfea648))
* make every tool free — remove ExtensionPay and all Pro gating ([#13](https://github.com/brightbar-dev/devtools-pro/issues/13)) ([7b0e9f7](https://github.com/brightbar-dev/devtools-pro/commit/7b0e9f7898db263579ec04cef019707f5dba6acc))


### Bug Fixes

* drop the retired Tailwind CSS Lookup from the cross-promotion links ([#11](https://github.com/brightbar-dev/devtools-pro/issues/11)) ([f1bf279](https://github.com/brightbar-dev/devtools-pro/commit/f1bf2794a0bcafec9753f5c3288e4008941a1f24))
* no stale tool bar after exiting a tool while a hint is showing ([#22](https://github.com/brightbar-dev/devtools-pro/issues/22)) ([df97244](https://github.com/brightbar-dev/devtools-pro/commit/df97244df8473bed3384217890460ad7736d6685))


### Performance

* inject the inspector on demand, isolate it in shadow DOM, and coalesce hover ([#14](https://github.com/brightbar-dev/devtools-pro/issues/14)) ([83dbb37](https://github.com/brightbar-dev/devtools-pro/commit/83dbb37fb14e0f3f52be9c65bd3746aa5c39c385))

## [0.3.0](https://github.com/brightbar-dev/devtools-pro/compare/devtools-pro-v0.2.0...devtools-pro-v0.3.0) (2026-09-14)


### Features

* add 20-locale i18n for CWS listing optimization ([9d859a7](https://github.com/brightbar-dev/devtools-pro/commit/9d859a70082fbb0f6e198d85c214e3849d981ddf))
* add cross-promotion links to popup ([7e492f7](https://github.com/brightbar-dev/devtools-pro/commit/7e492f7b4a7fd32ba30da3c252adc451436c6b16))
* add CWS store screenshots and promo tile ([0b1354d](https://github.com/brightbar-dev/devtools-pro/commit/0b1354d4f4036b0b46f57da39168c59d3b21a6c6))
* add large and marquee promo tiles, update small tile with new icon ([7e11bea](https://github.com/brightbar-dev/devtools-pro/commit/7e11beaaf151597c1b7f9a27a2ddd06d36896ced))
* add store/cws.json for CWS submission metadata ([a4e18a0](https://github.com/brightbar-dev/devtools-pro/commit/a4e18a0b7ea2c7687949fba2d0aab6c17c137262))
* implement all 6 pro tools ([4a4c87e](https://github.com/brightbar-dev/devtools-pro/commit/4a4c87e0986f97e8fac4036a4bfb13ef13ba3ec5))
* integrate ExtensionPay for Pro licensing ([e33c3e6](https://github.com/brightbar-dev/devtools-pro/commit/e33c3e660fab0de3e594376968b256f96870e19b))
* overlay toolbar + fix tool switching + content script injection fallback ([c25d636](https://github.com/brightbar-dev/devtools-pro/commit/c25d63611ff20d35dcab64121027f9923ef36db6))
* redesign icon — gear with code brackets and gold star ([0fffe7c](https://github.com/brightbar-dev/devtools-pro/commit/0fffe7cfdeb520b6266fd1aa21e2483f0093f979))


### Bug Fixes

* .claude-repo-policy.json to the schema the hook actually reads ([69e74d6](https://github.com/brightbar-dev/devtools-pro/commit/69e74d6410f9f203da1bb39fe55559a16ad3a1ff))
* add ExtPay content script for payment detection, diagnostic logging ([cbf730a](https://github.com/brightbar-dev/devtools-pro/commit/cbf730a3a45315d2c2b2f0a94116027054ea4291))
* **ci:** authenticate to GitHub Packages so npm ci stops failing on main ([fdae474](https://github.com/brightbar-dev/devtools-pro/commit/fdae474f92844e00febed137325c6ab12240ff15))
* CSS variables CORS note based on actual skipped sheets, not assumption ([e7e14fe](https://github.com/brightbar-dev/devtools-pro/commit/e7e14fe1f46902aba2bb1d5368db5a0ecee024ca))
* **deps:** bump vitest to 5.0.0 to close moderate path-traversal advisory ([#9](https://github.com/brightbar-dev/devtools-pro/issues/9)) ([930ce41](https://github.com/brightbar-dev/devtools-pro/commit/930ce417ac471a5a402c36e32a25b6376ba59444))
* options page init() unhandled promise rejection ([93caaf6](https://github.com/brightbar-dev/devtools-pro/commit/93caaf6597bf2f335752f72d69cbe125c91c4b29))
* popup broken — ExtPay crash kills background, init() fails silently ([c248616](https://github.com/brightbar-dev/devtools-pro/commit/c248616a10adf409dc064d2438bfbbf75072d92e))
* price $59→$60, Settings fallback, Login UX, onPaid listener ([4e8d4ab](https://github.com/brightbar-dev/devtools-pro/commit/4e8d4ab190cc16ee7ffd642b0ba6c58607e8ffcd))
* pro status broken — ExtPay listener conflict swallows getProStatus messages ([aa5aba7](https://github.com/brightbar-dev/devtools-pro/commit/aa5aba7810d6b041c5a9b29df4154ab03770fc2a))
* remove GitHub Packages auth — wxt-extpay moving to public npm ([a603f03](https://github.com/brightbar-dev/devtools-pro/commit/a603f039c80c2885cb564268578b77a4ff571d47))
* tool clicks do nothing — add error handling, content script injection fallback ([63f31d3](https://github.com/brightbar-dev/devtools-pro/commit/63f31d353a0d8e9e2a7b7936fadd2d13ab3513ce))

## [0.2.0](https://github.com/brightbar-dev/devtools-pro/compare/devtools-pro-v0.1.0...devtools-pro-v0.2.0) (2026-03-06)


### Features

* initial DevTools Pro extension scaffold ([0936d4c](https://github.com/brightbar-dev/devtools-pro/commit/0936d4c4b1671aa10abf2189b4786b17853e16b2))


### Bug Fixes

* prevent pre-1.0 feat from jumping to 1.0.0 ([#3](https://github.com/brightbar-dev/devtools-pro/issues/3)) ([b6ec062](https://github.com/brightbar-dev/devtools-pro/commit/b6ec062a165ee0d46e127ba90da9531e03070733))
* use config file for release-please, add bump-minor-pre-major ([#6](https://github.com/brightbar-dev/devtools-pro/issues/6)) ([f17bc7f](https://github.com/brightbar-dev/devtools-pro/commit/f17bc7f1aa45e3b8501a107f5c19fbf4e4e08a87))
