# Universal Multi-Office AI Business Hub — architecture audit

Audit date: **2026-10-27**. Reference: the owner-supplied **Pasted text.txt** headed “PURPOSE & MASTER INSTRUCTION”. This report compares that requested design with the existing repository; the attachment is a requirement/reference, not evidence that any integration already works.

At review time `package.json` identified preview.14, with preview.15 store-connection, setup-guide progress and approval-alert changes in the working tree. Those in-progress files are described separately below. The 2026-10-27 preview.15 release includes 158 passing Node tests and adds the scope described under Store connections; the guide progress API still has no dedicated step-by-step frontend. This audit did not read the owner's private database, sign into provider accounts, send messages, post jobs, publish products, start mining or run a new full test suite. Release validation remains in [TEST_RESULTS.md](../TEST_RESULTS.md); source presence and synthetic tests do not establish a live owner connection.

## Finding

The existing app supplies substantial persistence, evidence, business-document, local-AI, mail, warehouse and safe-action foundations. It is **not yet the universal connected hub described in the attachment**. Most named work/bidding/freelance/hiring integrations, a unified external calendar, an embedded multi-account browser and cross-marketplace synchronization are absent. Adding brand names, URLs or database tables alone would not complete them.

Keep the current app and its saved records. Implement the requested logical units through incremental adapters and migrations rather than recreating the repository or moving every working file into the attachment's illustrative folder tree.

## Existing architecture versus requested architecture

| Requirement | Observed implementation | Remaining work / boundary |
|---|---|---|
| Native Electron shell | Go Windows installer/launcher plus a bundled Node server. [Browser launch](../installer/browser_windows.go) opens a signed existing Edge/Chrome executable in app mode, with a default-browser fallback. | No Electron dependency, main/preload process, `WebContentsView`, internal address bar, browser tabs or per-account session manager. An app-style browser window is not an embedded browser. |
| Node and Python workers | [TypeScript server](../src/server.ts), [office loop](../src/office.ts), [standalone worker](../src/background.ts), SQLite-backed research and AI queues. | No production Python/Playwright/Selenium worker runtime. Playwright under `scripts/qa/` is development validation, not a shipped portal-automation engine. |
| Durable queue / broker | SQLite task checkpoints, leases, bounded retries, source backoff, manager pacing and audit records. | No Redis/message-broker deployment. Reuse existing durable jobs before introducing another broker and another failure/storage boundary. |
| Per-website isolated sessions | Founder authentication for this app and explicit paired-device credentials. | No third-party browser cookie vault/partitions. Login to this app is separate from login to a service provider. |
| Proxy per session | Bounded public-network transports for specific source/API reads. | No per-account proxy configuration, routing or verification. A proxy setting alone cannot guarantee anonymity, secure accounts or persistent logins. |
| Unified authentication controller | Existing single-founder password/session authentication; private connection files for specific services. | No Auth0/Frontegg deployment, provider OAuth consent callbacks, refresh-token lifecycle or provider revocation registry. An identity broker does not itself grant access to another platform's jobs/store/mail API. |
| Inbound service-ticket and bid feeds | [Historical awards](../src/research.ts), keyed [SAM.gov notices](../src/solicitations.ts), source-linked [opportunity cases](../src/deals.ts), bounded [public contact research](../src/lead-research.ts). | No authenticated work-platform feed imports. Historical awards are not available tickets, current bids or awarded work. |
| One form posting jobs everywhere | Actual saved [work orders](../src/business-documents.ts) and manual real-job entry in the [Distribution Center](../public/distribution.js). | No provider job-post submission or worker recruitment connector. A saved work-order draft does not post a public vacancy. |
| Unified calendar / FullCalendar | Work orders and meetings contain saved start/end times; Distribution Center shows a job list and printable preparation. | No FullCalendar dependency, common calendar-event table, provider calendar sync, recurrence/conflict engine or all-provider interactive calendar. |
| Target/business intelligence | Public source receipts, exact-company contact candidates, owner-confirmed website identity and contact provenance. | No BuiltWith/Shodan connector, broad staff roster harvesting, private-account intelligence or psychographic profiling engine. |
| Queued corporate communications | [SMTP/IMAP](../src/mail.ts), encrypted private access, reviewed single-recipient sends, do-not-contact list, uncertain-send holds and optional bounded header polling. | No high-volume autonomous cold-send router, Gmail REST connector, Graph connector or provider OAuth consent/refresh flow. Current code limits sends to 20 owner-approved attempts/day. |
| Factory asset compilation | Real original parameterized SVG files, review/export, exact hash/revision-locked [inspection proofs](../src/distribution.ts), print-to-PDF browser sheets and saved-file warehouse textures. | No production file-watcher pipeline, raster/PNG export compiler, packaged multi-file PDF/product builder, POD supplier submission or physical printer/carrier automation. Browser print-to-PDF is not a generated product PDF pipeline. |
| Instant multi-store sync | Existing niche/store projects and owner-reported setup. In-progress preview.15 adds the scoped WooCommerce adapter described below. | No universal listing fan-out, provider inventory/order webhooks, automatic price/discount optimization, cross-channel stock sync or instant all-store publication. |
| Worker learning | [Persistent work-priority learning](../src/learning.ts) ranks permitted recipes from actual receipts/feedback. | Does not fine-tune model weights, prove sale demand or give agents unrestricted external tools. [AI tools](../src/agent-tools.ts) remain a small explicit read/research allowlist. |
| Continuous availability | Normal server/worker can execute allowed work while its host is running, awake, clocked in and within source/backlog budgets. | Closing a browser is distinct from stopping its host. Host sleep, temporary hosting, source outages and absent models/accounts still pause work; no unqualified 24/7 guarantee. |

## Mandatory platform matrix

“Not implemented” below means this repository has no operational provider connector for the stated action. It does **not** assert that the vendor offers no API. Provider eligibility, terms, fees, account type and supported operations must be checked for each actual account before building/activating an adapter. A saved manual URL is never equivalent to an API connection.

| Category | Platform requested in attachment | Repository status |
|---|---|---|
| A — service work | Field Nation | Not implemented: no authenticated ticket import, bid/request, acceptance, payment or posting adapter. |
| A | Work Market / WorkMarket | Not implemented. |
| A | TechSee / Boomtown | Not implemented. Confirm the actual product/account instead of assuming these labels share one connector. |
| A | CloudBlue / FieldSolutions | Not implemented. Confirm the actual product/account and integration access. |
| A | Sourcehound | Not implemented. |
| A | HelloTech | Not implemented. |
| A | Puls | Not implemented. |
| B — construction | BuildingConnected / Autodesk | Not implemented. |
| B | PlanHub | Not implemented. |
| B | ConstructConnect | Not implemented. |
| B | Dodge Construction Central | Not implemented. |
| B | Procore Construction Network | Not implemented. |
| C — freelance | Upwork, freelancer/provider role | Not implemented. |
| C | Fiverr Pro, provider role | Not implemented. |
| C | Toptal | Not implemented. |
| C | Freelancer.com | Not implemented. |
| C | Guru | Not implemented. |
| C | PeoplePerHour | Not implemented. |
| D — hiring | Indeed | Not implemented: no outbound job submission/replication. |
| D | ZipRecruiter | Not implemented. |
| D | LinkedIn Jobs | Not implemented. |
| D | Craigslist Jobs / Gigs | Not implemented. |
| D | TaskRabbit | Not implemented. |
| D | Upwork, client/hiring role | Not implemented; distinct account role from incoming freelance work. |
| D | Fiverr, client role | Not implemented; distinct role from selling services. |
| E — stores | Etsy Open API v3 | Store project/research links and Etsy listing drafts exist; no Etsy OAuth or listing/file API adapter. |
| E | Amazon Seller Central / SP-API | Draft-channel reference only; no SP-API authorization, catalog/listing/order/fulfillment adapter. |
| E | eBay | Draft-channel reference only; no seller OAuth/offer/inventory/order adapter. |
| E | Facebook Marketplace / Groups | Manual preparation/reference only; no connected posting/group engine. Do not infer a universal posting API from a Meta login. |
| E | Shopify Admin | No Shopify Admin connector. A manual Shopify store URL, if saved, is a link/export workflow only. |
| F — communications | Proton Mail Bridge CLI | App supports an already running local Bridge via SMTP/IMAP and its generated access details. It does not install/sign into/control Bridge CLI. Real owner setup remains a separate check. |
| F | Gmail / Google Workspace API | Generic SMTP/IMAP can use provider-approved supplied credentials/tokens. No Gmail REST API or Google consent/refresh controller. |
| F | Outlook365 / Exchange API | Generic SMTP/IMAP compatibility depends on account/server settings. No Microsoft Graph/Exchange OAuth consent/refresh adapter. |

Additional earlier user requests also remain separate: TechLink, SAM.gov, BidNet, Biddingo and Construction Bid Source. SAM has a bounded keyed current-notice reader; the others have no job-platform adapter. Do not silently remove these prior requests when adopting the new matrix.

### Preview.15 work present during this audit

[Storefronts](../src/storefronts.ts), [transport](../src/storefront-transport.ts), [private vault](../src/storefront-vault.ts) and the [connection UI](../public/store-connections.js) add **WooCommerce REST v3** for owned stores, plus a manual-store-link mode. WooCommerce is an additional supported target; it does not satisfy the attachment's Etsy/Amazon/eBay/Meta/Shopify integrations.

The current scope is a verified USD store, owner-reported current cost/fee bounds, currently approved linked product/listing/design revisions, a store-hosted exact digital file, bounded draft/publish writes and durable attempt receipts. It checks the hosted file hash, stops on changed inputs, and reconciles uncertain results read-only rather than blindly resending. It does not upload private artwork to a provider, create seller/payment accounts, import live orders, ship POD goods, receive money or synchronize every marketplace. A saved `autoPublish` authority policy is not an autonomous publishing scheduler; no such scheduler was found in the inspected worker loop.

[Store setup guides](../src/store-guide.ts) save owner-reported account/listing/delivery milestones. [Approval attention](../public/approval-attention.js) surfaces actual waiting decisions and offers snoozing. Neither establishes provider verification, funds, a unified calendar or phone reminders. This report makes no release or real-account success claim for those in-progress changes.

## Changes needed before implementing the attachment literally

1. **Use the current Electron API and separate trusted/untrusted views.** `BrowserView` is deprecated in favor of `WebContentsView`. A future desktop shell needs isolated remote web contents, no Node integration for remote pages, context isolation, sandboxing, narrow IPC, HTTPS/navigation/new-window rules and explicit permission handling. Do not expose this app's database/credential APIs to pages visited in a browser tab. These are real shell implementation and update tasks, not a change to the office iframe. [Electron BrowserView](https://www.electronjs.org/docs/latest/api/browser-view), [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view), [security guidance](https://www.electronjs.org/docs/latest/tutorial/security).
2. **Partitions must identify an account, not just a platform.** Electron returns the same session for the same partition; `persist:` stores that session persistently. A single hardcoded `persist:field_nation_context` cannot isolate several Field Nation accounts. Use an opaque account/installation identifier and an explicit account-to-session registry. Account logouts, MFA and provider session expiry remain provider-controlled. Optional per-account proxy configuration should be a conscious supported networking choice; credentials and browser partitioning do not make a site connection untraceable. [Electron sessions and proxy API](https://www.electronjs.org/docs/latest/api/session).
3. **Build provider-specific authorization.** Etsy writes require API app credentials plus seller-authorized OAuth; Amazon SP-API requires selling-partner authorization; eBay and Shopify have their own authorization flows. Existing generic app login or an Auth0/Frontegg login does not substitute for these grants. Record scopes, expiry, revocation and reconnection per account. [Etsy authentication](https://developers.etsy.com/documentation/essentials/authentication/), [Amazon authorization](https://developer-docs.amazon/sp-api/docs/authorizing-selling-partner-api-applications), [eBay authorization](https://developer.ebay.com/develop/guides/sell/authorization), [Shopify standalone authentication](https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps).
4. **Keep mail adapters distinct.** Gmail REST scopes/consent and Microsoft Graph delegated authorization require separate app registration and token lifecycle work. Existing SMTP acceptance does not prove delivery/read status. Proton's Bridge has a CLI, but currently requires a paid plan including Mail; a free Proton web account is not a free Bridge deployment. [Google Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [Microsoft Graph delegated access](https://learn.microsoft.com/en-us/graph/auth-v2-user), [Proton Bridge CLI](https://proton.me/support/bridge-cli-guide), [Proton Bridge availability](https://proton.me/mail/bridge).
5. **Use authorized, reviewable provider actions.** Prefer official supported APIs. Where a provider permits account automation, start with owner-visible login/MFA and narrow read-only workflows; define any write's scope, cost, authority, idempotency and uncertain-result recovery. Do not treat injecting credentials into a hidden page as a universally supported integration. Do not implement mass simultaneous cross-posting before per-provider eligibility, duplicate handling, cancellation and the exact posting review are defined.
6. **Keep business intelligence professional and source-linked.** Save public, relevant work responsibilities and published business contact details with provenance and uncertainty. The attachment's exhaustive personal-interest/psychographic and vulnerability targeting is not an appropriate default business-data model. Do not infer personal traits, collect unnecessary private data or scan third-party systems for weaknesses as a sales workflow. No such engine was added by this audit.
7. **Replace “bypass spam detection” with legitimate communications controls.** Retain exact-message review, actual recipient/source checks, suppression, honest sender identity, provider limits and uncertain-send holds. Future queued mail needs scoped authority and complaint/opt-out handling. Do not add stealth delivery or spam-evasion behavior. No mass-send permission follows from adding a provider connector.
8. **Preserve the free-first and durability requirements.** Forced dedicated proxies, identity services, hosting and paid provider accounts can add recurring costs. Do not silently provision them. Current local queues can be extended without Redis, and the app can stay useful without third-party login automation. A machine that is asleep/offline or a temporary host cannot be represented as executing production work continuously.

## SQL/schema audit

None of the four attachment table names (`proxy_session_vault`, `unified_calendar_events`, `corporate_leads`, `product_inventory`) exists in the inspected source. Their intended responsibilities overlap existing records; adding empty copies would create competing truth sources.

| Attachment table | Existing foundation | Required design correction |
|---|---|---|
| `proxy_session_vault` | Founder sessions, paired-device records, private SAM/mail/sync/storefront credential files and storefront connection metadata. | Use account UUID + provider + owner/installation scope; a provider-name primary key cannot store several accounts. Keep only vault references and nonsecret session metadata in syncable SQL. Encrypt token/cookie/credential material, scope access, implement expiry/revocation, redact logs and exclude secrets from export. A forced non-null proxy IP and password are wrong for accounts that use direct networking or OAuth. Current AES-GCM private files are not a claim of hardware-backed encryption; the host key must also be protected. |
| `unified_calendar_events` | Existing meeting/work-order times, saved jobs, task due/follow-up information. | Add a projection/event layer linked to stable source records; include account ID, external ID/type, source version, time-zone information, provenance and sync cursor. Make epoch units explicit (`*_at_ms` fits current JavaScript timestamps). Distinguish an available opportunity/bid deadline from a confirmed assignment. Use integer minor currency units plus currency, not mixed floating payout totals. Deduplicate several outbound postings under one internal job rather than creating several appointments. |
| `corporate_leads` | Opportunities, lead/contact research, case history, public source receipts, reviewed drafts and suppressions. | Preserve company/contact/source relationships and unknown/missing email rather than requiring or guessing one. Store professional relevance and consent/contact status; omit unnecessary psychographic and weakness fields. Include retention/deletion and exact source provenance before expanding collection. |
| `product_inventory` | `commerce_records` with product/design/listing parents, approval hashes and revisions; store-project links; storefront connections/attempts. | One product can have several files/versions and several remote listings. Use separate asset, channel-listing and publication-attempt relationships with file hashes, revisions and durable uncertain states. A local asset path is not a buyer-delivery URL, one `target_storefront` cannot express all channel copies, and `synced_live` cannot stand in for an actual confirmed remote result. |

Future shared tables also need safe migrations, backup/restore and sync policy. In a future multi-tenant product, owner boundaries belong in schema and authorization; the current single-founder application must not be described as already tenant-isolated.

## Implementation order and concrete completion gates

| Step | Increment | Completion evidence |
|---|---|---|
| 1 | Finish preview.15's narrow store/approval/setup work and preserve the tested app. | Actual source and packaged HTTP/browser/CSP checks; encrypted-access/redaction tests; no duplicate publication after uncertain response; rebuilt installer manifest matches release. Owner-account live checks recorded separately from fixtures. |
| 2 | Unified internal schedule first: existing jobs, meetings and follow-ups, plus an explicit manual/provider-import format. | Correct UTC/local/DST rendering, unconfirmed opportunities distinguished from appointments, overlap/deadline handling, revision-safe edits, print/export and restart recovery. No external bid/post action is implied. |
| 3 | One real inbound work-platform adapter selected from the owner's actual accounts. | Confirmed supported integration/account access; bounded read-only import; source IDs, paging/cursor, deduplication, stale/cancelled status, sanitized evidence and truthful connection health. A manual import is an explicit fallback while API access is unavailable. |
| 4 | Native session-shell pilot as a separate desktop milestone. | Current Electron API, two demonstrably isolated accounts, visible navigation, permission/IPC restrictions, safe downloads/new windows, cookie/session persistence, logout/erase, origin tests, resource limits and updater/signing plan. Web version capability differences remain explicit. |
| 5 | First authorized provider write, not a universal cross-poster. | Concrete reviewed payload, employer/account eligibility, cost/capacity and publication scope, idempotency, receipt, cancellation and uncertain-result reconciliation. Expand only after the first adapter works with the real account. |
| 6 | Add marketplace and mail OAuth adapters one provider at a time. | Real consent/revocation/refresh tests, least-required scopes, provider product/category/file rules, verified delivery, token redaction, resumable work and reconciliation. Never mark an unconnected channel live. |
| 7 | Product compilation and optimization over actual evidence. | Owned original assets, reproducible exported file hash/dimensions, real owner review/quality feedback, current cost/margin limits, dated market observations and actual analytics. No invented competitor sales, automatic supplier spending, guaranteed income or physical shipping from an animation. |

This audit deliberately edits documentation only. It does not execute any of the attachment's account login, harvesting, posting, sending or purchasing instructions. The working app, original business records and current private connection boundaries remain the implementation starting point.
