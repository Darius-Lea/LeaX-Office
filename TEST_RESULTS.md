# Actual validation
2026-10-20 continued, Node 24.19.0 Linux.
- npm test: 3 tests passed, 0 failed/skipped. Source tests validate nationwide/unrestricted location filters, business-service keyword mapping, response/provenance validation and malicious source URL rejection.
- Worker/storage integration validates founder protection and sessions; multi-page Alpha collection; blocked-page checkpoint retention; resumed collection; expired claim recovery; Bravo provenance review/completion; cross-task URL deduplication/associations; three-page cap; exhausted abandoned claims; empty search; malformed-source rejection; SQLite online backup integrity and reopening saved records.
- HTTP integration starts isolated real servers and verifies unauthenticated access denial, bad Origin denial, founder setup, invalid task input, retry status restrictions and checkpoint preservation, source metadata, backups, logout, and founder/session/task persistence across server restart. Tests use temporary DBs removed afterward.
- Official upstream API contract retrieved successfully from GitHub to confirm supported fields and pagination schema.
- Live API HTTPS request failed cloud proxy CONNECT 403. Live collection NOT validated. Worker fixtures are synthetic, confined to test DBs. No business leads or contracts claimed.
- Windows behavior, real model inference and browser interaction unrun. Syntax checks run for changed server/worker/source/frontend. No build needed for native Node/static frontend; no typecheck configured.
