## Preview.42 repair validation — 2026-10-30

- Full Node 24.19 application suite: 176 passed, 0 failed, 0 skipped/cancelled. Initial run found one existing update-metadata failure caused by >500-character release notes; after shortening those notes the full rerun passed.
- Installer Go tests passed, including the >150MiB browser extraction regression and exact 124-file production payload extraction/hash verification. Original Chromium executable measured 249,798,656 bytes. Go 1.24.13 Linux cross-build completed; scripts/verify-installer.py confirmed embedded manifest/file/digest parity.
- Final local unsigned Windows x64 setup: 169,485,312 bytes. Corrected artifact retained outside checkout at /workspace/preview42-repair. Publication uses the existing versioned GitHub Release workflow; actual Windows GUI execution on the owner's device is still required.
- Full fetched Windows Electron 45.1.0 used normal upstream checksum verification. No TLS/hash checks were disabled. No owner database, browser profile, seller login or model settings were modified.

## Preview.41 browser validation — 2026-10-30

- Node 24 syntax checks for the Electron browser main process, LeaX UI, agent tools and browser-access module — passed after the secret-page, action-label and scroll-tool edits.
- Production application bundle — passed, 124 files including Chromium browser resources.
- Automated test suites were not run in this turn.
- The local Windows installer build was attempted but the Go linker ran out of available disk space; the previously committed installer was restored. GitHub Release asset, Render deployment, owner-device install, live signed-in page workflow and manual-stop behavior still need external confirmation.
## Preview.40 browser persistence and extension check — 2026-10-30

- Node 24.19 syntax checks for the browser main process, extension manager, preload and toolbar — passed.
- Production bundle — passed, 124 files; packaged manifest includes the Chromium runtime and `extensions.cjs`.
- Windows native installer compile, actual sign-in/broom/extension UI interaction and Render deployment — pending. The build does not yet prove website sign-in persistence on the owner device.
- Browser voice/page-reading assistant remains a follow-up and is not connected to the logged-in profile.
## Preview.39 browser validation — 2026-10-30

- Changed CCL/desktop-browser JavaScript syntax checks — passed.
- Electron 45.1.0 Windows x64 runtime downloaded using the package’s published checksum verification — passed.
- Production bundle and native installer packaging — pending; browser runtime must be embedded into the application manifest, installer, and CI artifact.
- Actual browser launch/login, Windows custom-protocol handoff, CCL-to-browser click-through, Render deployment and owner-device install — pending.
- Whole-device mouse/keyboard automation and neon edge indicator — not implemented.

## Preview.38 verification — 2026-10-30

- Focused public-web search, source attribution, AI-quality export, AI inference and meeting-isolation tests — passed, 7/7.
- Full test suite under managed Node 24 with workspace-local temporary files — passed, 176/176.
- Production application bundle — passed, 43 files. Original source, business data, development documents and source maps excluded.
- Manual browser click-through was not run; Playwright is not installed in this workspace.
- GitHub workflow and Render deployment — pending.
## Preview.37 verification — 2026-10-30

- Focused AI quality, meeting isolation and local inference tests — passed, 3/3.
- Full test suite under managed Node 24 with workspace-local temporary files — passed, 173/173.
- Production application bundle — passed, 43 files. Original source, business data, development documents and source maps excluded.
- GitHub workflow, Render deployment and manual browser click-through — pending.
## Preview.36 verification — 2026-10-30

- Focused tests for contact-source safety/JSON-LD, AI quality votes and exports, meeting context isolation, and local-model inference — passed, 7/7.
- Changed JavaScript/TypeScript syntax checks — passed.
- Full `npm test` under managed Node 24 with workspace-local temporary files — passed, 173/173. The default sandbox OS temp path produced Windows `EPERM` atomic-rename failures; rerunning from the writable workspace passed.
- `npm run build:app -- --out dist-preview-036` — passed, 43 production files.
- Windows installer CI, Render deployment and manual browser click-through — pending.

## Preview.35 verification — 2026-10-30

- Managed Node 24 `npm test` — passed, 171/171.
- `npm run build:app -- --out dist-preview-035` — passed, 43 production files.
- Changed public JavaScript and TypeScript syntax checks — passed.
- Added meeting invite revision/attendee regression; clarified lead brief and printable report assertions; expanded lead-research test fixture for additional same-domain contact pages and 10 public search query types.
- Render version, GitHub installer workflow, manual browser interaction, and owner-device installation — not yet checked.
## Preview.34 verification — 2026-10-30

- `npm run build:app -- --out .\dist-preview-034` — passed; 43 production files bundled.
- `node --experimental-strip-types --test test/commerce.test.ts` — passed, 10/10. AI invitation test used a synthetic response from a stubbed `127.0.0.1:11434` Ollama endpoint, verified idempotency and draft status, and confirmed export is blocked until approval. No external model or network call was used by that test.
- Changed public JS and TypeScript syntax checks — passed.
- Windows installer CI, Render deployment, and manual browser workflow remain pending.
## Preview.33 CCL integration check

- node --check public/ccl-app.js — passed.
- node --check public/control-center.js — passed.
- CCL state projection check — passed; verified statuses are passed through while secrets remain omitted.
- Browser click-through and API-key entry flow — not run in this checkout; Playwright is unavailable.
- GitHub installer build for preview.33 — starts on push.
## Preview.32 validation status — 2026-10-30

Three focused test runs passed: operations error-copy, meeting roster limit and inference gating, and distribution projection. Changed JS/TS syntax and git diff check passed. The wider selected test run was inconclusive on Node 22.15/Windows because of sandbox EPERM during private-vault rename, dependent paired-worker setup failures, and an existing nested-transaction failure in store preparation. The package requires Node 24.19+. No local Playwright or esbuild dependency is installed, so browser E2E and local production build were not run here. GitHub Actions, Render deployment and owner-device install are pending.

Changed JS/TS syntax and diff checks passed. No test suite or local production build was run. GitHub Actions run 41000790533 built and published the Windows installer successfully. Render /api/version reports preview.31; /download/windows returned an installer whose SHA-256 matched the published checksum. No owner-device install, browser-engine test or end-to-end meeting animation check was run.

## Preview.30 packaging repair

Preview.29's Windows installer workflow failed in `build-production.mjs`: esbuild reported a syntax error at the end of `public/app.js`, caused by malformed carriage returns introduced during the UI edit. The source was normalized, and the release-note separator was corrected. Preview.30's GitHub installer build is pending; it must pass before publication. The focused 6 learning/AI tests and changed-file syntax checks had passed before packaging. The local build still cannot run without installed `esbuild`.

## Preview.29 — workflow feedback scope

6 focused tests passed in `test/learning.test.ts` and `test/ai.test.ts` under Node 22.15 experimental type stripping. The new regression covers American Power-specific feedback staying out of another configured company’s AI context, explicitly shared process habits appearing across company scopes, and shared feedback leaving company work-ranking weights unchanged. Changed JS and TypeScript files passed syntax checks.

`npm run build:app` did not complete locally because the checkout has no installed `esbuild` package. The GitHub Windows release workflow remains the packaging check. The full test suite and Render deployment were not verified in this step.

## Preview.28 — adaptive workflow learning and CCL shell

Focused validation: 5 tests passed in test/learning.test.ts and test/ai.test.ts using Node 22.15 with experimental type stripping. They verify persisted eligible-work ranking, inclusion of same-agent owner feedback in future AI grounding, and role isolation. JavaScript and TypeScript syntax checks passed; CRLF-aware git diff check passed.

Full suite and installer packaging were not verified locally because the installed Node 22.15 is below the declared 24.19 minimum. The experimental full-suite run was inconclusive (114 passed, 35 failed, 2 cancelled); it hit unsupported Node sqlite APIs, missing dependencies and sandbox EPERM errors. GitHub Actions uses Node 24.22 for the installer build. Render deployment and a real Windows installation remain unverified.

Deployment boundary for preview.21: the public Render version request was rejected by this environment's HTTPS CONNECT proxy with403. This does not establish Render deployment success or failure. Git push and package verification are separate evidence.

## Preview.21 — technology rollout research, 2026-10-29

Node 24.19.0 Linux: `npm test` executed 167 tests: **164 passed, 3 failed, 0 skipped/cancelled**. All nine new rollout/backend HTTP tests passed. The three failures are the same independently reproduced baseline discrepancies in `lead-research.test.ts` (page receipts 4 vs 3 and discovery requests 10 vs 1) and `operations.test.ts` (Retry scheduled vs Waiting on a tool); those files/source were unchanged. Full run log in the development machine: `/workspace/leax-preview21-test.log`.

New tests verify actual-page provenance instead of snippets, publication uncertainty, bounded candidate/contact requests, responsibility excerpts without inferred contact authority, blocked/partial outcomes, persisted cooldown and overlap protection, clock-out/pause, stale lease recovery, duplicate refresh history, preserved >60-source storage and rejection of hidden script/template/comment evidence. Isolated HTTP test verifies founder auth, origin protection, validation before fetching and preference persistence across server restart.

Source and standalone-production Chromium rollout checks passed with isolated synthetic offices/provider responses: actual founder authentication, source/contact/responsibility display, malicious text and unsafe-link rejection, typed form/focus preservation during rendering, settings/manual URL actions, cooldown controls, CSP and mobile document/computer-content bounds. Desktop/mobile screenshots were inspected. Reproduce with `HQ_PLAYWRIGHT_MODULE=file:///workspace/.tools/browser/node_modules/playwright/index.mjs HQ_CHROME_PATH=/usr/bin/chromium node scripts/qa/rollouts-browser-check.mjs`, plus `HQ_TEST_PACKAGED=1` for the production bundle. These fixtures do not establish live provider access, current jobs or a verified hiring person.

A real default-transport public search attempt returned `getaddrinfo EAI_AGAIN html.duckduckgo.com`, status Blocked, zero leads. No robots/TLS/DNS safety was bypassed. Hosted Render search and a keyed/current external integration were not validated.

`npm run build:app` passed with **38 production files**. Verified official Go 1.24.13 installed outside the repository; `go test ./...` passed in installer/. Final `scripts/build-native-installer.py` cross-build and `scripts/verify-installer.py` passed with preview.21: **38 matching embedded files**, **11,156,992 bytes**, SHA-256 `023a9f7069fec3fcea2763e45844ff1bfc4413d76f9ce4b9a7cdc5fda6ffa55e`. It remains unsigned and was not executed on Windows. Final HTML-only copy clarification was included by rebuilding and reverifying the package. No new credentials, owner data, seller account, outgoing message, binding bid or revenue were used.

## Preview.18 — resilient work continuity, 2026-10-28

`npm run build:app` passed and built 37 production files. No automated test suite was run for this increment. Production Render `/api/version` reports 0.2.0-preview.18. GitHub Actions run #14 succeeded and published the 37-file Windows x64 setup (11,147,776 bytes; SHA-256 `e58dd95ddf672125ebcd87095268dfe8e411143ada98b4d29b4ef545d1672513`). The installer is unsigned; no owner-device installation was performed.

## Preview.15 — store access and approval checkpoint, 2026-10-27

The Distribution Center assembly line opens Store connections. Users without an account can open the existing in-app store workspace, save their store project and use its official provider signup link. A saved store URL is explicitly a manual handoff, not a verified API connection. New setup-guide progress APIs are implemented; a separate step-by-step guide frontend is not part of this release.

Owned WooCommerce stores can verify read access and USD currency with private encrypted consumer credentials. Reviewed digital product/listing/design revisions can prepare a concrete draft or explicitly authorized publication. The exact approved file must already be hosted at the same public store origin; its bytes are checked against the saved hash. This does not upload files or connect Etsy, eBay, Amazon or Payhip publishing APIs. Price bounds include recorded costs, fixed/percentage fees and contribution/margin floors. They are estimates, not guaranteed profits. Uncertain writes are held for read-only reconciliation, never silently repeated. Keys and publishing authority are host-local and excluded from shared-record sync.

A plain-language warning appears for actual waiting message/product approvals. It opens the relevant saved work, respects an open editing form and supports a fifteen-minute snooze. Idle workers, outages and missing accounts do not create fabricated approval alerts. Product templates and existing bounded host preparation remain separate from model inference or actual marketplace demand.

Validation:158 automated Node tests passed, zero failed/skipped, on pinned Windows Node 24.19 with workspace TEMP/TMP. Tests cover encrypted credentials, unsafe destinations, exact-file hash/revision approval, integer pricing floors, stable provider SKU, uncertain-write reconciliation, guide progress and genuine approval candidates. Source and standalone-production Chromium checks passed assembly-line navigation, in-app no-account setup, manual connection status, authenticated boundaries, pending-alert review/snooze, mobile bounds and CSP. Seller protocol fixtures are synthetic; no real seller account, listing, customer order, outgoing message or income was used/generated. Windows installer parity and deployment measurements are recorded after packaging.

Next work: verified in-session desktop updates with background download choice, an actual isolated browser engine, current marketplace evidence, exact-file quality feedback and approved template variations. The newly supplied universal-hub architecture is reference for this continuation, not evidence that every listed provider is already connected. Existing official updates still require opening the setup executable. No untraceable/unhackable browser, unattended all-platform operation or guaranteed income is claimed.

Windows x64 setup:12,027,904 bytes;37 matching embedded production files; SHA-256 `88625f46ca10e03413dfe299b357e9e568db87014a7240318040389a76e7240a`. The installer remains unsigned; no owner-device installation was performed.

## Preview.14 — daylit Distribution Center, 2026-10-26

Application source changes are confined to `public/distribution-scene.js`. The warehouse now has a bright sky/fog, roof and skylights, polished concrete and daylight materials; more detailed articulated workers; sixteen separate station positions; seated blue-gloved inspectors with lamps/scopes and copies of actual saved proofs; moving saved-file previews; and a truck/carton/loader visualization gated by recorded physical fulfillment. Idle staff stay still, while non-inspector workers marked Working walk between stations. Reduced motion keeps decorative animation still. Proof movement illustrates saved files and does not create products, shipments or cash.

First person starts in the Distribution Office. Window-level keyboard controls work away from the canvas and ignore text fields, modifiers, open forms and inactive scenes. Mobile gets an actual thumb stick, with pointer capture/cleanup and keyboard handoff. Existing office orchestration, distribution records/UI/CSS and public API contract are retained. Only local renderer diagnostic metadata was extended.

Actual source and standalone-production browser checks passed: bright rendered pixels, exact authenticated artwork/proofs, sixteen non-stacked fixture workers, Working-only walking/idle stability, seated inspection, moving proof previews, physical-order gating/removal of trucks/loaders, keyboard movement with focus outside the canvas, actual mobile thumb-stick movement, form preservation, saved job/print/proof/CSP/revision boundaries and exact meeting return. Fixtures use isolated synthetic records and do not establish real sales, shipping or inference. JavaScript syntax/whitespace and installer parity passed. Backend code is unchanged from preview.13's 146 passing Node tests; no fresh complete Node suite is claimed for this scene-only change.

Windows x64 setup:12,009,984 bytes;34 matching embedded files; SHA-256 `f1be56d29e91452a16ef03126ddacd9835d92b43945b29c4c395750bd97d4b28`. The setup remains unsigned; no owner-device installation is claimed.

Next functional priority is genuine supported seller connections and setup, market evidence, quality feedback and pricing/publication. No seller account is newly connected in this visual release. The requested LeaX AI private browser is not implemented; a browser cannot be guaranteed untraceable, unhackable or compatible with every site's login/embedding policies. The owner-provided research is preserved at `docs/research/owner-storefront-notes.txt` as unverified reference, not app analytics. Verify claims with primary sources before using traffic, fees, conversion, royalty or income numbers. Never seed its reported numbers as actual business results.

## Preview.13 — integrated Distribution Center, 2026-10-26

The saved sales location now uses a separate warehouse renderer adapted from the owner-supplied Distribution Center design. Headquarters retains its existing office. The warehouse has design/production, print/proof, quality, research, job preparation, racks, loading doors and town-hall zones. First-person, third-person and overview controls share the saved location. Real saved artwork appears on the line and design monitors; worker cards use actual roster/assignment state. Movement buttons are hidden on keyboard/pointer computers and shown on touch devices; using movement keys on a hybrid device hides the touch pad.

Authenticated state/routes and UI are integrated: revision/hash-locked exact SVG inspection/print, actual jobs/orders/analytics, manual job drafts and printable saved tools/scope preparation. Original reference sample workers, fake sales/hashrate and CDN entry point are not served. Meetings retain the connected CEO boardroom and restore the exact prior warehouse position/look. Corrected overview fog/clipping on narrow sizes and preserved graphics quality/resource reuse.

146 automated Node tests passed, zero failed/skipped, on pinned Windows Node 24.19 with workspace TEMP/TMP. Source browser checks passed actual two-context synthetic WebRTC media/display/cleanup; commerce/AI/CSP boundaries; and the full warehouse, exact-proof, job, desktop/touch, revision and mobile workflow. Source and standalone-production warehouse browser checks passed actual pixels, exact file textures/printing, actual roster states, first/third/overview switching, exact-position meeting return, poll-safe manual jobs, stale-proof denial, desktop keyboard UI, real touch controls/keyboard handoff, mobile bounds and CSP. Source and production two-session synthetic WebRTC checks also passed real RTP/video, mute/leave and video cleanup. The rebuilt unsigned Windows setup has34 matching embedded files, 12,004,864 bytes, SHA-256 `c45a324ccc1a759a254509752486dc199953071f633e311a58bbe44feb63eb09`.

Next increment requested after this checkpoint: clickable store connections from the production line, current public-market evidence, quality feedback and guarded pricing/discount/publication. This release does not connect a seller account, publish listings, obtain live seller sales data, operate physical fulfillment or mine cryptocurrency. Those states remain explicit. No guaranteed income, profit or perpetual unattended operation is claimed.

## Distribution Center development checkpoint validation — 2026-10-26

145 Node tests passed, zero failed/skipped, on pinned Windows Node 24.19 with workspace TEMP/TMP. This includes seven new isolated Distribution Center projection/proof/schedule/retry tests. JavaScript syntax and whitespace checks passed. These are module/existing-app tests: the new Distribution Center routes/UI are not wired into the server yet, and its renderer facade is not browser-validated. No preview.13 installer was built. Keep this work in a draft branch; preview.12 remains the tested live release.

## 2026-10-26 — preview.12 release checkpoint

Every new saved office journey takes ten seconds in both directions; existing in-flight deadlines remain intact. City travel now shows a chauffeured rear passenger cabin with a starlight ceiling and pointer/touch/keyboard look controls. Arrival greetings open the selected location for first-person walking or its saved work. The expanded conference suite has twelve seats, a long table, actual remote video on its wall display, a live-status table controller and CEO suit/cuffs/watch. A meeting returns to the exact prior exploration position. This is original room artwork inspired by a modular conferencing layout, not a physical Poly hardware integration.

138 Node tests passed, zero failed/skipped, on pinned Windows Node 24.19. Source Chromium checks passed actual two-session synthetic WebRTC audio/video, boardroom metadata, mute/leave/video cleanup, ten-second drive/jet and saved arrivals, chauffeur drag/button/keyboard controls, actual-CSP product previews, AI/human mutual exclusion with no fabricated missing-model response, exploration/meeting position restoration and mobile bounds. All five standalone-production browser checks passed: actual two-session WebRTC room display and cleanup, ten-second chauffeur/jet controls and arrivals, exploration with exact meeting return position, commerce/AI/CSP boundaries, and store/update/local-engine/mobile workflows. Desktop/mobile screenshots were inspected, including the corrected visible watch/cuffs and rear cabin. Early parallel browser attempts timed out waiting for stable controls under software-rendering load; sequential reruns are used for the final result.

The unsigned Windows x64 installer is 11,984,896 bytes; all31 embedded production file hashes and its SHA-256 sidecar match preview.12. SHA-256: `03def486de7d87751be9fece5af2d02c8438ee6a47bf3dadff228ab9e1328fd4`. No target-device installation, actual owner local model, seller account, real sale, shipment or mining payout was validated. The virtual coin-fabrication scene is decorative and actual mining remains disconnected/read-only.

Next increment: the owner supplied Distribution Center.html after the short Markdown reference. Its warehouse design is the reference for the sales-location replacement, with exact saved artwork, actual employee assignments, recorded orders, manual real jobs and printable proofs/preparation. Source/data/UI drafts are staged separately; they are not part of this preview.12 release. No live EverBee/seller feed, external job-platform integration or uninterrupted hosting is claimed.

## Latest confirmed validation — 2026-10-25, preview.11

136 Node tests passed, zero failed/skipped, on pinned Windows Node 24.19.0 with four test processes and workspace-local TEMP/TMP. Source and standalone-production Chromium checks passed loaded/public version parity, a clearly synthetic newer-version notice and official update link, real store/file preparation and original SVG preview, empty fulfillment truthfulness, local-engine discovery/navigation and mobile bounds. Store tests forced an atomic mid-batch rollback and safe retry; AI-engine/queue checks used explicit synthetic protocol fixtures. No live owner model or earning was verified.

The unsigned Windows setup was rebuilt at 11,974,656 bytes. The embedded preview.11 manifest and all 31 production files matched; SHA-256 `4e493c2fb900b7ea6a639c1095cb72045bbefc62fdddf983d4702fa3bcd80606`. The hosted complete setup had the same digest, and stores.js, updates.js and local-engines.js matched tested source. PR #5 merged at db10e7bd823eaca294ed53005021667d08b54949. See [TEAM_HANDOFF.md](TEAM_HANDOFF.md) for the reproducible scope, actual remaining gates and newly requested work that is not included in these results.

# Actual validation — 2026-10-21

## Latest: 2026-10-23 — 0.2.0-preview.6

`npm test`: **83 passed, 0 failed/skipped** on Node 24.19 Linux. New isolated SQLite tests cover source identity and case deduplication, persisted scope/qualification/reminders, stale-edit rejection, date validation, linked owner-reported stages and cash without double-counting, correction/void handling, company/contact isolation, ambiguous multi-job drafts, notice freshness, bounded automatic candidate batches and CRM evidence preservation. Case-specific Today prioritizes the actual due company over optional setup and clears acted-on reminders. Source failures stay separate from owner-action faults. The Ollama protocol test receives bounded saved opportunity plans with explicit owner-attestation labels; it is not a live inference claim.

Four backup tests verify consistent restorable copies including accounts, tasks and settings; standalone journal/integrity/schema checks; concurrent-copy deduplication; failure/corrupt-copy retention and retry; missing-copy repair; and seven-copy rotation that preserves manual, foreign or changed files. Two private-export HTTP tests verify committed WAL data, complete consistent streamed downloads and removal of only request staging after success, failure and disconnect. No owner database was used.

Three history tests verify bounded pages, literal wildcard/SQL-looking search, all saved data retained, active old work outside the selected page, truthful oversized-queue totals and invalid-input rejection. An isolated 10,000-record base-snapshot comparison measured approximately **22.8 MB before and 139 KB after (99.39% smaller)**. This is a synthetic base-snapshot measurement, not the full `/api/state`, a memory guarantee or a universal performance result. Other collections and large manually managed pipelines still need broader profiling.

Authenticated HTTP checks cover the new case/backup routes, exact-origin rejection, actual case edit/result saves, stale revision rejection, invalid history parameters and verified manual backup creation. Draft tests reject unfinished owner placeholders both at approval and at legacy composer access; saved authorized profile details fill new signatures. Native Go tests and Windows x64-target vet pass, including six exact-model-readiness cases. A different installed model cannot substitute for the configured tag.

Source and standalone production Chromium end-to-end checks pass the opportunity workspace with 1,001 synthetic archive records: paging/search, tracking an actual saved source fixture, company-specific Today, qualification and follow-up persistence, unsaved edits across polling, reporting today's event before local noon, interested reply plus payment without a false win, contact isolation, pricing prefill and explicit cross-customer reset, retained history, close/reopen, declined-case filtering, verified backup/private export and mobile bounds. Packaged live-operations, concise lead-brief and complete executable-download checks also pass, including actual saved-file checksum verification, retry/cancel and rejection of a mismatched fixture. The packaged WebGL scene retains all 14 remodel variants, orbit/polling stability, owner/printer raycasts, staff/report/patrol behavior, narrow side-monitor layout, mobile resize and disposal; unchanged polls add no measured textures/buffers. No page JavaScript errors occurred; desktop/mobile screenshots were inspected.

The preview.6 unsigned Windows x64 GUI setup was rebuilt at **11,387,904 bytes**. The embedded manifest/version and all **20 file hashes** match; PE header, payload embedding, executable digest and exclusions for original source/test/data/key files were checked. SHA-256: `f4a4238a8452de47fdc18ac7e47cdb0fd85bdb7154e8c8dafa6faeeaef5a8c7c`.

Actual Windows installation/DPAPI/signature/shortcut/recovery execution, live local-model inference and authenticated current-notice validation remain unrun. The owner reported successful download, which does not establish installation or inference. No new live company contacts, messages sent, bids submitted, paid services, startup registration or business income were generated by these checks. Historical live-source validation remains separately documented in preview.5 below. Dependencies are unchanged; no new dependency-audit result is claimed.

## Latest: 2026-10-22 — 0.2.0-preview.5

`npm test`: **63 passed, 0 failed/skipped** on Node 24.19 Linux. New coverage exercises automatic eligible-lane assignment, persisted provider backoff, rolling budgets, confirmed-site research despite index failure, source-backed CRM/draft/brief follow-through, stale contact holds, quality-review context and clock-out during an awaited source request. Source access failures do not generate CEO fault alerts; malformed evidence and local pipeline errors still do. A later source success clears the old outage from current status without deleting history.

Learning tests verify actual persisted Beta-Bernoulli posterior updates, changed eligible-work ranking, receipt/employee ownership, proof requirements, duplicate-feedback protection, correction handoffs and exclusion/retraction of excused incidents. This is work-priority learning, not language-model fine-tuning. Operations tests distinguish actual Running rows, queues, setup, source waiting and approvals; quotes do not become cash and idle staff do not become faults. HTTP tests verify authentication/origin protection, learning across a real server restart, byte-range/HEAD downloads and inference-backed native readiness. Four integrated manager-cycle tests also verify the preserved owner-request interface cannot bypass duplicates, clock-out, pacing, lane refresh, source backoff or rolling caps, and older manager records expose the calculated research window. Preparing/paused/failed setup cannot select a model or claim completed inference.

**Real source validation:** with `NODE_USE_ENV_PROXY=1`, the actual USAspending worker fetched and reviewed **60 historical award records** in an isolated temporary database, completed its source/provenance cycle and saved four clerical handoffs. Three contact jobs were queued and one validated completion trained the learning policy. The database was removed afterward. No contacts, current jobs, sent messages, customer demand or revenue were inferred; no owner business database was modified.

Source and standalone production Chromium checks pass the live operations monitor, manager/statistics/work-log windows, actual backend reward/correction learning, preserved unsaved feedback, saved panel preference and mobile bounds. The concise CEO brief, original-report preservation, real pending draft, explicit company-site confirmation and print/save lead sheet regressions also pass. Synthetic source/company/Running rows are confined to isolated test databases; they are not real leads or activity.

The download browser check transfers the **complete rebuilt executable**, saves bytes matching its SHA-256 and filename, and checks success instructions, retry, no-JavaScript direct download and mobile layout. Explicit synthetic routes test unavailable-file errors, cancellation and rejection of a checksum mismatch without saving it. Packaged WebGL checks pass all 14 remodel changes, narrow office area with the side monitor, owner/printer raycasts, roster/report/patrol behavior, mobile resize and disposal. Unchanged polling retains the camera and adds no measured buffers/textures. No page JavaScript errors occurred. The improved office is procedural; no measured realism multiplier is claimed.

Native Go tests and Windows x64-target vet pass. Five new Go tests exercise staged runtime repair/preservation, cancellation, unexpected-file rejection and office-handoff-before-AI ordering with failed/cancelled preparation and verification callbacks. The unsigned Windows x64 GUI executable was rebuilt: **11,366,912 bytes**, embedded preview.5 manifest and all **20 file hashes** match, source/data/key exclusions hold and the PE GUI header/checksum are verified. SHA-256: `6d9b4fc8ad18b0bd88a2cae66f815594dbcf60eca0af50b082c92e6e1f61fa8a`.

Actual Windows GUI installation, native signature/DPAPI/shortcut/recovery execution, live local-model inference, keyed SAM.gov current notices and successful live company-contact discovery remain unrun/unverified. The workspace proxy rejected CONNECT to the live Render site, so its deployed download/release was not verified here. No new dependency audit was claimed; dependencies are unchanged. No emails, bids, grants, paid services or Windows startup registration were enabled. Earlier validation entries below are historical.

## Executed
`npm ci --ignore-scripts` and `npm test`: **18 passed, 0 failed/skipped** on Node 24.19.0 Linux. Native TypeScript/static ES-module architecture needs no frontend build. Syntax checks and git diff whitespace checks passed. `npm audit --omit=dev`: zero reported vulnerabilities; this is not a security audit.

Coverage includes the retained founder/session/restart/backups tests; worker pagination/checkpoints/deduplication/handoff; source-unavailable behavior and unsupported-role rejection; company/roster migration and preservation; standalone office; Johnson recovery/handoffs/missing evidence/idle/deduplicated alerts; deterministic team and precursor-output gating.

New tests exercise:
- Service-fit screening against cabling, diesel/generator, fire pump, vague and overseas examples; concrete next steps without guessed contacts or revenue.
- Actual SQLite AI-run storage with mocked Ollama tags/chat/pull protocol, installed-model validation, one inference at a time, limits, missing/unavailable state, stale interrupted runs, bounded retries, unsupported tool-call rejection, AI-labeled notes and reopening results. Two-cycle context isolation prevents advice from unrelated task evidence; stale current notices are reclassified before model grounding.
- SAM.gov official query/schema with synthetic responses: no key means no request; limits/title rotation/geography; explicit timezone deadlines; notice type and active flag; stale-source labels; contracting POC provenance; preserved history on failure and no synthetic key value in saved state/history/audit.
- Public-contact URL/DNS/private-IP/TLS-request boundaries, robots exact-agent precedence, extraction/source labels, cooldown and failure behavior. Transport fixtures are synthetic; no guessed contact fields.
- Draft recipient must match a published source; official-notice inquiry requires fresh active open-review classification and a published POC; review/approval gate; edits revoke approval; no sender or bid submission.
- Authenticated export is a real SQLite snapshot; unauthenticated export denied. Current-bid setup-required API, private contact target denial and missing-model/download-confirmation routes checked.

Chromium/Playwright Core browser smoke passed against a temporary DB: first-run private fragment consumed and removed from history, founder setup, seven desks, real WebGL canvas, orbit/owner-computer interaction, alternate views, manager status, company edits, eighth employee, clock persistence, model/device setup screen, published-source draft preparation, edit preservation across polling, honest no-model error, no page JavaScript errors. Desktop/mobile screenshots captured and desktop WebGL rendering visually inspected. The WebGL-specific static harness additionally checked the actual 3D owner-desk raycast. Browser tooling resides under /tmp, not application dependencies.

PowerShell script parser passes using a checksum-verified official PowerShell binary with writable local XDG cache paths. Embedded Node backup/import helper passed Linux SQLite fixture checks: read-only WAL source backup, standalone staging copy, integrity/schema requirements, source preservation, corrupt/unrelated database rejection and refusal to overwrite an existing destination.

## Unrun / blocked
- No live Ollama runtime/model in this cloud machine. No actual model inference or model download was claimed from mocked tests.
- No SAM_API_KEY in runtime or available configuration metadata. Official authenticated current-notice access and real open-bid collection remain unvalidated; state is Setup required.
- No live new public-contact success claimed from transport fixtures. USAspending source behavior after latest sorting remains subject to live source availability; user-provided output shows real historical records but does not establish open work.
- Actual Windows GUI, portable runtime Authenticode/ACL/DPAPI, start/stop/shortcut/import rename/rollback operations unrun. This is not a verified Windows release or signed native installer.
- No email sent, bid submitted, ads/video rendered, external provider account connected, qualifying contract won or revenue collected. Continuous hosting, broad rollout coverage and full SaaS security remain unfinished.

Synthetic fixtures are confined to isolated temporary databases and removed afterward; they never seed business data.

2026-10-21 controlled-office/native increment: `npm test` passes 21 tests, including new bounded model tool execution/receipts, rejected fabricated references, packet scope/escaping/source links, construction/healthcare lane rotation, and authenticated packet/download routes. Chromium smoke passes founder persistence/clock controls, employee editing, owner-computer tabs, public-contact draft editing, missing-model status and actual WebGL render with metallic lettering; desktop/mobile screenshots inspected. Native Windows GUI cross-build succeeds; no Windows device is available, so install, Authenticode/DPAPI/shortcut/import GUI execution is not claimed validated. Live Ollama inference and keyed SAM.gov access remain untested. No real leads, contacts or model outputs were fabricated for testing.

2026-10-21 automatic local AI: `npm test` passes 22 tests, including completed-inference-before-config, failed-inference settings preservation, prior model archive and retained founder records. Go policy/archive tests pass on Linux (RAM selection, unsupported hardware, checksum denial and path traversal denial); Windows-target `go vet` and GUI cross-build pass. Updated Chromium smoke passes. Official Ollama v0.40.7 release digest and SHA-256 listing match; native engine/model download, Windows startup/DPAPI and actual model inference remain UNRUN here. No completed inference is claimed based on transport fixtures.

2026-10-21 0.2.0 preview: **25 Node tests pass**, including business guidance provenance/readiness, integer-cent pricing persistence, public full-executable transfer and a standalone production app started without node_modules. Packaging test caught and fixed the bundled-worker CLI guard entering an infinite loop before HTTP startup. Go policy/browser URL/integrity/cancellation tests pass; Windows-target vet and GUI cross-build pass. Browser harnesses exercise actual WebGL/font loading and raycast, drag/reset/pinch/mobile layout, owner desktop dragging, readiness save, pricing save, real-new-note notification/read state, draft edit preservation and completed Bravo packet visibility; no JS errors. Production-bundle browser smoke is run separately. Package audit reports zero runtime vulnerabilities. Actual Windows execution, signing, live model inference and keyed live SAM search remain unrun; no synthetic research or money claims enter the real business database.

2026-10-21 preview.2 validation: **32 Node tests pass** including real-fault-only strike/dedup/reassignment, outcome cash/corrections/grounding, changed-result review queue, capability profile/print escaping, funding source holds/failure retention, private key no-plaintext persistence and production startup. Native Go policy/private-input tests pass; Windows-target vet/cross-build pass. Updated desktop/browser checks pass actual result/correction/date saves, funding/profile facts, generated documents, persisted CEO incident resolution, edit preservation, mobile bounds and zero JavaScript errors. WebGL officer-uniform scene still renders with real-state movement. The Windows key form was tested with an explicit synthetic browser route fixture; actual stdin/DPAPI remains UNRUN. Grants.gov live access returned proxy403 here; no genuine grants, approval probabilities or earnings are claimed from tests. Runtime npm audit reports zero vulnerabilities.


2026-10-22 preview.3 validation: **36 Node tests passed, 0 failed/skipped** on Node 24.19 Linux. New coverage includes concise scope-specific advice, installed-local-voice selection/cancellation/fallback, durable design enum/boolean validation and reopening, AES-256-GCM credential at-rest protection/tamper rejection/restoration, authenticated exact-origin hosted key saving with a real process restart, and design persistence across an HTTP restart. Production startup serves the new speech asset without node_modules. The alternative standalone office restores saved connections before processing.

Source and standalone minified-production Chromium regressions passed: missing-key action opens the real masked form; whole-toast click and keyboard activation work over open dialogs; key submission uses actual encrypted private files and clears the field; help returns to the form; short advice does not repeat source/report content; saved notes/evidence open separately; polling preserves an open explanation and unsaved controls; design survives reload; mobile dialogs fit; no page JavaScript errors. Speech control checks use a clearly synthetic installed-voice fixture; an actual Chromium session without a voice reports its limitation. No natural voice quality or audible-device playback is claimed.

Actual WebGL source and packaged-scene checks exercise finishes, three layouts, single/dual monitors and optional furniture, camera/polling stability, owner-computer/printer raycasts, roster changes, actual-record-driven patrol/report animations and mobile resize. Unchanged polling adds no WebGL buffers/textures in the measured smoke test. The unsigned Windows x64 setup was rebuilt; embedded preview.3 production manifest and all 19 file hashes match, speech asset included, original source/tests/data/credential files excluded, executable PE header and SHA-256 match. Go policy tests and Windows-target vet pass.

A fresh npm runtime audit timed out at registry.npmjs.org; it did not return a current vulnerability assessment. Dependencies are unchanged; prior zero-vulnerability results above remain historical. Windows execution/DPAPI/shortcuts/install recovery, live local-model inference, authenticated live SAM.gov research and live Grants.gov access remain unrun or blocked as described above. No email, bid, grant application, real customer result or income was generated by tests.


2026-10-22 preview.4 CEO briefing/contact research validation: **42 Node tests passed, 0 failed/skipped**. New isolated SQLite tests verify structured brief selection within its task, exact-company contact separation, safe source links, correctly labeled award locations, missing role/demand facts, original note/read-state preservation and concise saved text. Print/HTML tests check the company/action-first sheet, escaping and placement before the full packet audit. HTTP tests cover authenticated brief/print routes, origin rejection and private-target/missing-record rejection. Model context remains bounded and contact rows are scoped to the selected companies.

Five new enrichment tests use explicit synthetic transports: confirmed-site homepage plus two actually linked same-origin pages, source-linked email/tel/labeled-visible-phone extraction, business-only structured address handling, source quotes, real saved contact IDs and an actual Pending approval draft; actual-link candidate parsing and identity confirmation before draft-ready storage; robots/network failure without guessed results; dated same-company reuse/cross-company cache rejection; history preservation and bounded/idempotent cycle selection; explicit selected manual processing and an in-flight confirmation guard. These fixtures prove workflow behavior, not live contact availability.

Source and standalone minified-production Chromium checks pass company/action/contact-first note and per-record views, public-source links, historical/unknown-role labels, original report behind a separate window, frozen reading across polling, concise read-aloud controls with a synthetic device voice, real pending draft creation, explicit website confirmation, print/save brief opening with the correct contact and no old objective, mobile bounds and zero page JavaScript errors. Packaged WebGL checks retain all remodel variants, camera/polling stability, computer/printer raycasts, staff changes, actual-record-driven movement and mobile disposal; unchanged polls allocate no extra measured GPU textures/buffers.

The preview.4 unsigned Windows x64 executable was rebuilt; production manifest/version and all 19 file hashes, source/data/credential-file exclusions, PE header and executable SHA-256 checked. Native Go tests pass. Windows execution, live local inference, authenticated current-bid access and successful live public-company contact discovery remain unrun/unverified. DuckDuckGo/Bing robots requests returned proxy CONNECT403 here. No CENTRE MARKET BUILDING LLC contact was invented or used as seed data, no real business record was changed by fixtures and no message was sent.


## Retained history from merged live-manager work

These earlier checks and six-hour scheduler descriptions predate the preview.5 planner above.

2026-10-22 live manager panel increment: **42 Node tests passed, 0 failed/skipped** on Node 24.19. Added coverage that the manager response includes a six-hour research window distinct from its one-minute patrol timer and keeps older saved patrol records readable. `node --check public/app.js` passed and `npm run build:app` produced the 19-file standalone application. The full suite needed `TEMP`/`TMP` redirected into the writable workspace because this sandbox blocks atomic rename operations under its default temp path; both affected credential/HTTP tests passed with that environment adjustment. No browser visual inspection, live SAM.gov check, contact-source success, Ollama inference, or Windows-device validation was performed in this increment.

2026-10-22 live operations console upgrade: **43 Node tests passed, 0 failed/skipped** on Node 24.19.0. Added an isolated manager-cycle test and authenticated HTTP coverage for the optional early research action, including clock-in enforcement, use of the saved goal/next lane and duplicate queue protection. Updated manager idle-state wording. `node --check public/app.js`, `npm run build:app` (19-file standalone app), and `git diff --check` passed. The full suite initially could not open loopback sockets in the restricted shell; after granting turn-scoped network access for local HTTP tests, all HTTP and packaged-app tests passed. No browser visual inspection, direct live SAM.gov search, Ollama inference, Windows-device validation, or commercial result was performed in this increment.
A separate read-only live check of the production USAspending API through the repository's `fetchPage` adapter returned 20 real historical award records on page 1 (`hasNext=true`), including source IDs and modification dates. The check only printed three identifying summaries and wrote nothing to the founder's business database. This validates real public historical-data access in this environment; it does not validate current subcontracting demand. No SAM.gov key was available, so authenticated current notices were not live-tested.

## 2026-10-24 — web/download audit and preview.8 packaging repair

Node 24.22.1 on Windows: 83 passed, zero failed/skipped, using workspace TEMP/TMP. The initial run had eight setup-related failures before dependencies and writable temporary storage were configured; the complete rerun passed. npm dependency audit reported zero vulnerabilities. Production build generated 20 application files. Native Go tests and vet passed on Windows with Go 1.27.3. JavaScript syntax and diff whitespace checks passed. No installer GUI was executed.

The public Render homepage and office3d.js returned HTTP 200; hosted office scene equals main at 11f39be after newline normalization. No private hosted state was read. The old committed installer embedded preview.7 and lacked current miner visuals, while source package metadata remained preview.6. The new verifier rejected this mismatch. Rebuilt preview.8 Windows x64 setup is 11,401,216 bytes; SHA-256 bc7312b0f1db2b02cb678a630e07089dbbc6cd57ff41eef473e69d97ccbb24e1. All 20 current production hashes, embedded manifest, exact payload inventory and executable sidecar pass. Production HTTP and download/range tests passed again after rebuilding (2/2).

No fresh interactive browser/WebGL check, target-device install/DPAPI/shortcut/import test, actual local-model inference, keyed SAM request or live contact discovery was performed. Package parity is not full environment/feature parity. WEB_DESKTOP_AUDIT.md records known missing capabilities. No owner data, outgoing communication, paid service, startup registration or live deployment was changed.

## 2026-10-24 — preview.9 connected workflows

101 Node tests passed, zero failed/skipped, on Windows Node 24.19.0, matching the installer runtime. Coverage adds document revisions/status guards, exact-customer and integer-money handling, atomic invoice/outcome rollback, retries and receipt corrections; mail approval/snapshot/suppression/uncertain-send and header-link checks; sync schema/bounds/offline-edit/delete/conflict checks; actual two-office HTTP pairing/exchange/revocation with an injected local test transport; authenticated business/print/mail/pairing boundaries; and live-call participant/session/signaling limits. No owner database or real provider credential was used.

Source and production browser workflow checks passed proposal acceptance, invoice issue/partial payment/balance, encrypted account setup, pairing-code creation and mobile bounds; no page errors, and the invoice screenshot was inspected. Two authenticated Chromium sessions established actual WebRTC audio with synthetic devices; inbound RTP packets, microphone mute and leave were verified in source and production. This does not validate real devices across NAT or an external media relay. SMTP authentication, certificate-verified TLS and DATA exchange passed against an isolated local synthetic server; the packaged authenticated mail API also passed this real transport check without node_modules. No external message was sent. IMAP protocol behavior is tested with injected fixtures; no real mailbox was connected.

The final production build contains 24 manifest-listed files. Preview.9 unsigned Windows x64 setup: 11,917,824 bytes; SHA-256 d3dfa4dae8e458b8f46616024f83124c66d2cdfe4b944db1841b001fdebe74ff. Embedded manifest, exact file inventory, all file hashes and executable checksum passed. Production HTTP and download/range checks passed after the final build (2/2). The native installer source is unchanged from its previously passing Go tests/vet; no setup GUI or real installation was executed. Production text is newline-normalized to keep manifest parity consistent across Windows and hosted checkouts. New runtime dependencies were pinned; npm reported zero vulnerabilities, and distribution notices include their supplied licenses.

Remaining checks: actual owner Windows setup/import/DPAPI/shortcuts/rollback, target hardware/model inference, real mail/Proton account and token renewal, target HTTPS pairing, real-device/cross-network calls and keyed live SAM/contact-source validation. Authentication, private credentials, host worker/AI state and backups are excluded from shared-record sync. Local Bridge needs a supported provider account and same-host installation. Remote calls may require suitable STUN/TURN access. No paid service, new owner account, OS startup registration, external communication or live database deployment occurred.


## 2026-10-25 — preview.10 actual validation

122 Node tests passed, zero failed/skipped, on the installer's pinned Windows Node 24.19.0 with four test processes and a workspace-local temporary directory. Default managed temporary storage prevents atomic private-file renames; rerunning within the permitted workspace passed the encryption, backup and pairing tests. New cases cover persistent travel/revision safety, original-file escaping and review, receipt/cost gates, preference/analytics evidence, local read-only mining status, authenticated paired AI leases, replay/revocation/expiry, cancelled sharing during inference/readiness and another-process stop, meeting rollback without AI, and healthy paired routing despite a stale local setting.

Actual source-app Chromium checks passed: two authenticated sessions exchanged synthetic camera/audio media, received inbound RTP, displayed 640x480 remote video through the first-person wall texture, preserved mobile bounds, muted, left, restored the orbit camera and cleared a departed peer. Desktop/mobile screenshots were inspected. A separate integrated check used the actual CSP to save niche preferences, prepare three real SVG draft files, display an authenticated same-origin image, block unreviewed export, preserve zero receipts, open/cancel drive and jet interfaces, open first-person AI controls without the computer modal, reject absent inference without saving a fake turn, exclude concurrent human/AI presentations, and restore the prior clerical view. No real customer media, owner database, provider connection, sale, payout or message was used.

Actual local model ports were unavailable. Paired inference tests use explicit synthetic protocol fixtures, not a live model claim. Owner-specific installation, model quality, marketplace accounts, production pairing and cross-network media remain environment checks. Production bundle and rebuilt installer validation are recorded in WEB_DESKTOP_AUDIT.md.


## Preview.19 — company lead discovery

Lead contact research now starts from a saved company without requiring the user to supply a website. It compares three public search queries, ranks and checks up to five candidate sites, continues past inaccessible or mismatched candidates, and shows site/search source links with company-name match evidence in the lead brief. An uncertain site remains unconfirmed until the CEO checks it. Contact results still come only from checked public company pages; no contact details, decision-maker role, current demand, outreach, sales or mining income are invented.

Validation: `npm run build:app` completed with 37 production files and `git diff --check` passed. Automated tests were not run in this turn. Live Render company discovery and the Windows installer build are not yet verified.


## Preview.20 — expanded public lead discovery

Removed the fixed five-candidate, three-query, 200-link and two-contact-page limits from public company research. It now follows the public search provider's next-result links for ten targeted company queries, checks every matching candidate domain it finds, reads all matching contact/vendor pages on a company site, and shows every candidate in the lead brief. Existing HTTPS, public-address, robots-policy, source-attribution and company-identity confirmation safeguards remain in place. Coverage is limited to pages available in the public search index; the app cannot exhaustively scan every website on the internet.

Validation: production app build completed with 37 files; `git diff --check` passed. Automated tests were not run in this turn. Live public-index behavior and Render deployment are not independently verified.
