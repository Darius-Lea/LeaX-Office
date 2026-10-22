# Integrations

USAspending public federal contract-award API: POST https://api.usaspending.gov/api/v2/search/spending_by_award/ . No API key or paid account is required. Fixed destination, bounded timeout/response and up to three pages of 20 records per assignment. Keywords map from business services without a geographic exclusion. These historical awards identify possible partners, not open jobs. Official schema: https://github.com/fedspendingtransparency/usaspending-api/blob/master/usaspending_api/api_contracts/contracts/v2/search/spending_by_award.md . Live access has been blocked by the development proxy; synthetic fixtures do not establish current source availability.

SAM.gov current opportunities: official public read API, separate from award history. The owner requests a free key and enters it in Owner computer → Connections. Saving and live access checking are separate. Installed Windows saves with user DPAPI; hosted/non-native offices save encrypted private files outside SQLite and restore them on startup. No personal key is shipped or included in database transfers. Host resets can lose saved access. Searches are bounded and source classifications do not establish bid eligibility. Keyed live access remains unvalidated here.

Ollama: real loopback inference and bounded allowlisted research tools, durable runs and receipts. Native Windows setup prepares an app-private engine/model on port 11435; an existing separately installed loopback engine can use port 11434. Setup must obtain a real response before saving automatic AI configuration. The Linux development environment has no live model; protocol/storage tests are synthetic. Windows installation and real inference require device validation.

Grants.gov: separate bounded public search/detail connector with saved provenance and conservative eligibility/freshness holds. No guessed approval probabilities or default recommendation to apply. Actual API access returned proxy403 here and remains unvalidated.

Public company contact-page reader: owner supplies a public HTTPS page; SSRF/DNS/TLS/robots/size/time boundaries apply. It saves published contacts with sources, not verified decision-maker identity or permission to send.

Read-aloud: user-initiated browser speech synthesis using installed English device voices only. Availability and sound vary; no cloud speech provider or account is connected.

No email sender, calendar, telephony, billing, bank, account-login automation or external ad-rendering provider is connected. Approved unsent drafts can open the owner's mail composer; the owner sends manually.
