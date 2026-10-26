## Distribution Center development checkpoint validation — 2026-10-26

145 Node tests passed, zero failed/skipped, on pinned Windows Node24.19 with workspace TEMP/TMP. This includes seven new isolated Distribution Center projection/proof/schedule/retry tests. JavaScript syntax and whitespace checks passed. These are module/existing-app tests: the new Distribution Center routes/UI are not wired into the server yet, and its renderer facade is not browser-validated. No preview.13 installer was built. Keep this work in a draft branch; preview.12 remains the tested live release.

# Distribution Center continuation — unpublished work, 2026-10-26

The last working published release is preview.12, merged in PR #6 at `0a6ea86ebbfc7c96b6b8f7bdfe4621389f095076`. Its live web assets and complete Windows download were verified. Installer SHA-256: `03def486de7d87751be9fece5af2d02c8438ee6a47bf3dadff228ab9e1328fd4` (11,984,896 bytes;31 matching embedded files).

This branch preserves the next increment after the owner asked to finish pushing. Package metadata is preview.13 for development; the committed installer remains the tested preview.12 release. DO NOT merge/deploy this development branch until the remaining integration and validation below are complete. No owner database or wallet is included.

Saved work:
- `public/distribution-scene.js` adapts the supplied warehouse reference to local Three.js, actual-record worker and product texture interfaces, first/third-person/overview controls, disposal and reduced motion.
- `public/office.js` has an unfinished integration facade selecting the warehouse in the saved sales location while retaining the main connected boardroom. Validate initialization, callback recursion, saved position restoration, visibility and sizing before release.
- `src/distribution.ts`, `public/distribution.js`, `public/distribution.css` and `test/distribution.test.ts` are copied from the staged data/UI implementation. They are not yet wired into server routes, the state response, static asset allowlist or app startup. No live rendering-to-business connection is claimed yet.
- `src/campus.ts` and `public/campus.js` rename the display to Distribution Center; the durable office ID remains sales so saved data is preserved. Ten-second timing is unchanged.
- `design/Distribution Center.reference.html` is the user's original design reference, not a production entry point. It has sample names/tasks/orders/TH/s, external CDN and inline code. Do not ship those as real business state, or add it to a public/static allowlist.

Next work: finish the server/UI integration described below, add sizing and navigation styles for `.office-renderer-surface` and `.distribution-view-controls`, ensure camera-mode controls stay accessible while exploring, run source and packaged authenticated browser/CSP/mobile/proof/job/meeting-return checks, run npm test, rebuild preview.13 Windows setup, verify embedded parity and then merge/publish. The original main branch remains the working user-testable checkpoint.

The user wants realistic warehouse activity, exact real digital products and printable inspection copies, actual assignments, manually recorded field jobs, job reminders and preparation/tool sheets, background creation/analytics, and their supplied warehouse layout. Do not promise photoreal graphics, live EverBee/marketplace access, actual shipments, nonstop hosting, revenue or mining. Actual mining remains disconnected/read-only; a physical coin visualization cannot mint BTC.

# Distribution Center staged integration

These files are staged outside the repository so preview.12 can be published before this next feature. Do not copy distribution-runtime.ts or distribution-test-run.ts: those are temporary test adapters with machine-local import URLs. Copy only src/distribution.ts, public/distribution.js, public/distribution.css, and test/distribution.test.ts into the matching repository directories.

## Existing source integration

1. src/server.ts: import distributionState, distributionProof, distributionProofHTML and distributionJobPrepHTML from './distribution.ts'. Add /distribution.js and /distribution.css to the public static asset allowlist. In the authenticated /api/state response, reuse the already assembled commerce/business/stores/operations values and set distribution:distributionState({clock:state.clock,commerce,business,stores,operations}). Avoid computing those four projections twice.
2. Add authenticated GET /api/distribution returning the projection if useful. Add these authenticated GET handlers before any generic prefix handling:
   - /api/distribution/proofs/:id: Content-Type text/html; charset=utf-8, body distributionProofHTML(id).
   - /api/distribution/proofs/:id/image?revision=<positive integer>: validate Number.isSafeInteger(revision), require revision >= 1, and call distributionProof(id,revision). Serve its unchanged .svg with Content-Type image/svg+xml; charset=utf-8 and CSP "default-src 'none'; style-src 'none'; sandbox" plus private/no-store and nosniff, same as current commerce preview. Stale revisions fail safely rather than printing a different design.
   - /api/distribution/jobs/:id/prep: Content-Type text/html; charset=utf-8, body distributionJobPrepHTML(id).
3. public/app.js: import initDistribution/renderDistribution from './distribution.js'. Call initDistribution({api,refresh,openComputer}) alongside initStores; call renderDistribution(s) in each successful refresh alongside renderStores.
4. public/index.html: add a stylesheet link /distribution.css. The production bundler already copies all public js/css; no dependency or installer exclusions change.
5. Renderer agent owns the standalone Distribution Center geometry/controls. It can consume state.distribution and call window.hqDistribution methods described below. Do not duplicate sample workers, products, mining counters or schedules from the reference HTML.

## Renderer contract

window.hqDistribution = {
  open(),
  inspectProduct(designId),
  inspectWorker(actualRosterId),
  inspectStation('design'|'template'|'quality'|'print'|'dock'|'orders'|'schedule'|'research'|'workers'),
  addJob()
}

state.distribution products have actual design ids, previewUrl, inspectionUrl, sha256, revision, original width/height, approved boolean, and optional saved store project. Use the preview URL as a same-origin authenticated texture. Preserve its aspect ratio. This is the saved file; it may be a draft and is not proof of a live online listing.

Workers are actual operations employees, preserving status/currentAction/detail/receipt. A decorative worker must not claim an assignment or title absent from these records. Orders are actual owner-recorded order states, not shipping automation. Job drafts are distinguished from Scheduled and In progress; past-due scheduled starts ask the owner to confirm actual status and never auto-complete.

## Actual staged validation

2026-10-26: source/public syntax checks passed under Node24.19. Three isolated tests passed, zero failed/skipped, against a workspace temp SQLite database using scratch adapters that resolve the existing repository dependencies:
- Real store range projects exactly three actual saved files; keeps reviews false, receipts/orders zero, worker Waiting state unchanged and no new audit activity from rendering.
- Inspection proof escapes text, carries the actual SVG digest/revision and rejects an old revision after a real saved edit.
- Actual saved work-order statuses drive due attention; printable prep escapes tool notes and does not claim an unrecorded completion. Non-work-order preparation is rejected.

Run node --test test/distribution.test.ts after copying. Full npm test, actual authenticated browser/CSP/mobile/print/renderer checks, production rebuild and installer parity remain required before publication. No live account, source scrape, external message, job acceptance, sale, label purchase or mining was performed.

## Scope and limitations

The user HTML is a geometry/design reference. Its default sample mode, hardcoded names/work, fake sample order cycles, fake TH/s, command buttons and CDN/inline scripts are deliberately not imported by these data/UI files.

This increment adds actual file inspection/print and manual field-work records over existing business workflows. Continuous EverBee/marketplace feeds, actual store integration, product optimization model work, seller posting, fulfillment, cross-provider schedule import, phone delivery/notifications and real mining still need their own implementation and account/infrastructure validation. Existing bounded product preparation continues independently while the host is running, office clocked in and review/daily caps permit it. No 24/7 guarantee is introduced.
