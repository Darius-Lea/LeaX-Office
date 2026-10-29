# Isolated browser checks

Run from the repository root using Node 24.19–24.x. These scripts create synthetic offices in the operating system temporary directory and never use the owner database, real media, provider credentials or customer orders.

Provide Playwright through an existing development environment (`playwright` import), or set `HQ_PLAYWRIGHT_MODULE` to the file URL of its module. Set `HQ_CHROME_PATH` to an installed Chromium/Chrome executable if not using Playwright's bundled browser. Do not add these development tools to the customer installer.

Run `node scripts/qa/stores-updates-browser-check.mjs`, `node scripts/qa/campus-commerce-browser-check.mjs`, `node scripts/qa/meeting-room-browser-check.mjs`, `node scripts/qa/ten-second-travel-browser-check.mjs` and `node scripts/qa/explore-scene-browser-check.mjs` for the source app. Run `node scripts/qa/distribution-browser-check.mjs` for the distinct warehouse, actual-file printing, manual jobs and meeting-return workflow. Run `npm run build:app` first and set `HQ_TEST_PACKAGED=1` to check the standalone production app. The live call check uses synthetic camera/microphone devices in two separate browser sessions.

On restricted Windows development environments, point TEMP and TMP to a writable workspace scratch directory so the private credential and backup atomic-rename tests can run. Do not disable those checks or change customer storage to accommodate the development restriction.

Browser scripts leave synthetic screenshots/data under their printed temporary folder for inspection. They are not real activity or earnings. Read TEAM_HANDOFF.md for actual release results and unfinished integration gates.

Run `node scripts/qa/rollouts-browser-check.mjs` for technology-rollout research, or build first and set `HQ_TEST_PACKAGED=1` for the standalone production app. This check uses real isolated founder authentication and synthetic rollout API responses; it verifies source excerpts, published contacts and responsibility excerpts, unsafe-link omission and text escaping, preserved form edits/focus during polling, automatic-research settings, the public-URL request, cooldown controls, mobile panel bounds and CSP. It does not crawl live companies, identify a real decision-maker, send outreach or submit bids. Provide Playwright with `HQ_PLAYWRIGHT_MODULE` and an installed Chromium with `HQ_CHROME_PATH` when needed, as above.
