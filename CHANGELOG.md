# Changelog

## [0.3.0](https://github.com/brightbar-dev/devtools-pro/compare/devtools-pro-v0.2.0...devtools-pro-v0.3.0) (2026-04-03)


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

* add ExtPay content script for payment detection, diagnostic logging ([cbf730a](https://github.com/brightbar-dev/devtools-pro/commit/cbf730a3a45315d2c2b2f0a94116027054ea4291))
* CSS variables CORS note based on actual skipped sheets, not assumption ([e7e14fe](https://github.com/brightbar-dev/devtools-pro/commit/e7e14fe1f46902aba2bb1d5368db5a0ecee024ca))
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
