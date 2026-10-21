# Current bids: official SAM.gov notices

Historical USAspending awards are contracts already issued. They remain potential-partner evidence, not open bids. The separate current-notice connector uses the official **SAM.gov Get Opportunities v2 API**:

https://api.sam.gov/opportunities/v2/search

Official contract checked against [GSA API documentation](https://open.gsa.gov/api/get-opportunities-public-api/) and its [GSA-maintained source](https://github.com/GSA/open-gsa-redesign/blob/master/_apidocs/get-opportunities-public-api.md). Documentation retrieval from GSA's GitHub succeeded during development; live authenticated SAM data has not been validated because no usable key was supplied to these tests.

## Required free account access

The official API requires a public API key from a SAM.gov account. SAM.gov does not charge for account registration or public API access, but request quotas depend on account role. Request a public API key from the SAM.gov **Account Details** page using its secure account controls. Configure it as **SAM_API_KEY** in the application machine's secure environment settings. Do not paste the key in chat, commit it, put it in a research objective, or share screenshots containing it.

No key means **Setup required**, with no API request. A missing key cannot be bypassed by inventing bids or scraping private endpoints. A successful API read does not establish SAM registration, set-aside eligibility, insurance, licenses, staffing, bidding permission or an awarded APG contract. The connector never submits a bid or sends a message.

## What the search actually covers

Each search makes **one read-only request**, with a 20-second timeout, 2 MB response cap, `limit=25`, `offset=0`, and the last 30 UTC calendar dates. No state or country restriction is applied. It searches one mapped APG service phrase through the API's supported **title** field; subsequent successful searches rotate through the available mapped phrases. Procurement types are requested as the documented multi-value `ptype=o&ptype=k` for solicitation and combined synopsis/solicitation.

This is a bounded discovery pass, not every US bid or every private/regional/international rollout. Notice descriptions are recorded as official description URLs and are not fetched with additional hidden requests. The complete title and source must still be reviewed for service fit. The API's own current versions update on its schedule; this application does not make those records instantaneous.

## Classifications and next action

- **Open for review:** current notice type is Solicitation or Combined Synopsis/Solicitation, active is Yes, a finite timezone-qualified response deadline is in the future, and the local source check is no older than six hours. This means review the source, not that APG is qualified or should submit a bid.
- **Deadline not confirmed:** active eligible notice type, but deadline is absent, malformed, date-only or lacks an explicit time zone. Never assume the host computer's time zone.
- **Not an open bid:** other notice type, inactive/archived state, or a confirmed elapsed deadline. An Award Notice is never treated as open just because its base type used to be a solicitation.
- **Needs source refresh:** a previously active, future-deadline candidate has not been checked within six hours (or its saved check time is implausibly in the future). It must be refreshed before using an open-review label.

All rows expose `needsRefresh`, `freshness` and `lastChecked`. An old record does not prove that no amendment, cancellation or extension has occurred. The owner should open the original SAM.gov notice, check amendments and attachments, confirm the deadline/time zone, evaluate scope and service territory, review set-aside/registration/NAICS/insurance/licensing requirements, and calculate staffing, travel, materials and margin before deciding whether to bid.

If the official response contains a point of contact, it is saved as **a published contracting-notice contact**, with its original public notice link. It is not inferred to be a prime contractor's vendor-services decision-maker. No phone/email/name is invented. Public listing alone does not establish current details, suitability or outreach permission.

## Persistence, failures and credential protection

Current notices are stored in `solicitations`, separate from historical `opportunities`. Updates preserve prior evidence in `solicitation_history`. Network, schema, size, access and quota failures keep earlier evidence; stale future-deadline rows lose the open-review label. A per-process guard and 60-second retry cooldown prevent accidental overlapping/repeated manual requests. The parent office scheduler controls longer search intervals.

Only the API request contains the key. Request URLs, raw exception messages and upstream error bodies are never persisted or logged, because they can expose credentials. Description URLs have credential-like query fields removed, textual values are redacted against the configured key, and the application stores no key value. Source readiness reports only key presence.

## Verification

`test/solicitations.test.ts` uses synthetic API responses and an isolated temporary SQLite directory. It tests absent credentials without network, bounded nationwide query parameters, notice types, timezone-qualified future and expired deadlines, ambiguous deadlines, stale-source classification, contact provenance, preservation on failure, record history and absence of the synthetic key from saved records/settings/history/audit. These tests establish protocol and storage behavior, not live SAM access or real business eligibility.
