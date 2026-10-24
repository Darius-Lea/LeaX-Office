# LeaX Office audit — preview.9

The missing workflows identified in the earlier audit now have implementations in the review branch. This does not certify every integration, device or commercial requirement.

| Area | Current result |
|---|---|
| Web/download code | Rebuilt Windows package; embedded manifest and all 24 production files verified |
| Saved proposals | Priced lines, scope/terms, owner-evidenced issue/accept/decline, immutable issued versions |
| Work orders/dispatch planning | Crew, place, time, acceptance/completion evidence and saved status history; no automatic messages to technicians |
| Invoices/receipts | Partial payment/balance, retry protection, transactional existing-ledger links and correction handling; no bank verification |
| Email | Standard SMTP and optional IMAP, local Proton Bridge support, encrypted private access, verified TLS, explicit single-message send confirmation, uncertain-send holds and opt-outs |
| Replies | Bounded header imports and exact reply/sender links; full bodies/attachments stay in the provider; interest is not inferred |
| Meetings | Saved agenda/minutes/decisions, meeting-service links and live browser calls; no recording; remote networks may require STUN/TURN |
| Web/local sharing | Explicit pairing, bounded two-way shared-record changes, offline edits, conflict review and device revocation; secrets/auth/model installation/host execution remain local |
| Existing core | Automated regression suite passes; original company/source/history data preserved |

Actual checks: 101 automated tests on Windows Node 24.19.0 (the installer’s pinned runtime); source and packaged desktop/mobile workflow checks; two-browser real WebRTC audio using synthetic devices, including inbound RTP/mute/leave; actual certificate-verified SMTP protocol exchange with an isolated local synthetic server; production build and embedded installer verification. No real external email or owner data was used.

Remaining environment checks: owner Windows setup/import/DPAPI/shortcut/rollback, actual local AI quality, owner provider/Proton configuration, keyed live SAM notices, target HTTPS office pairing and real-device media across restrictive networks. The executable is unsigned. Broader verified prospect coverage, provider OAuth sign-in/refresh, full mailbox import, bank/accounting connection and multi-tenant security remain separate work. Free-host storage still needs private backups/durable hosting.

Setup: read CONNECTED_WORKFLOWS.md. No paid service, OS startup, real account connection, live database migration or deployment was performed. Changes are being published for review, with the live website retained until a data-preserving deployment is arranged.
