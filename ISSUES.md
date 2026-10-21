# Known issues
- Live api.usaspending.gov blocked by cloud proxy CONNECT 403. Official API contract checked from upstream GitHub; connector tested with synthetic fixtures only. No live results claimed.
- USAspending records are historical contract awards, not open solicitations or confirmations that contractors need APG services. Bravo checks record provenance, not recipient contacts or business eligibility. Qualification remains unverified.
- National/overseas research covers US federal award records only. No complete worldwide discovery connector. Three-page cap is explicit; broad searches are incomplete and ranked by award value, not expected APG revenue.
- No local inference yet; Ollama absent in this environment. Alpha and Bravo are deterministic workers currently, not language-model agents.
- Manual backups only. Loss of data directory or host can lose business records; keep protected off-device copies.
- No browser E2E or TypeScript typecheck. Windows registration script untested; background execution requires explicit opt-in. No automatic registration performed.
- Single-founder local app, not publicly deployable SaaS. No tenant isolation/password recovery/email verification. Founder remains free of subscription billing.
- Legacy tasks with portal-availability evidence cannot be reviewed by the new connector; queue a new assignment. Legacy records remain intact.
- Missing/invalid source identity or description blocks the page instead of inventing evidence; failed tasks retain earlier pages and allow manual retry.
