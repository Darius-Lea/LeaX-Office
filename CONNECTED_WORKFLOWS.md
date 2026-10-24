# Connected office workflows — preview.9

## What is implemented

Open My computer → Proposals, jobs & invoices. Select an existing opportunity. Prepare a proposal, work order, invoice or meeting. Each record stays linked to that exact opportunity, with revisions and status history. Drafting creates no customer acceptance or income.

- Proposals: priced lines, USD tax amount, payment terms, scope and acceptance criteria; explicit issued/accepted/declined records with an owner evidence reference.
- Work orders: location, crew/technician, start/end, acceptance criteria and completion evidence. Scheduling requires an assignee and start time; completion requires saved evidence.
- Invoices: immutable issued scope, line totals, partial receipts and remaining balance. Payment recording uses the existing outcome ledger, with retry protection and transaction rollback. Corrections/voids update the displayed cash; these remain owner reports, not bank verification.
- Meetings: agenda, participants, service link, actual minutes and decisions. Scheduled meetings can open a live browser audio/video call for up to four participants signed into the same office address. Microphone/camera permission is requested only on Join; nothing is recorded. Same-network audio was tested with synthetic devices. Other networks may require a suitable STUN/TURN server, whose access is entered only in that call form, or the saved external meeting-service link. Never assume the animated office room is a running call.

## Email, including Proton Mail

Open Connected email or Connections → Connect any SMTP / IMAP email account. Use your provider's actual server settings and an app password or provider-issued OAuth access token. Some providers disable these protocols or require additional account administration. This is not a promise that every email plan permits external clients.

Proton Mail uses local Proton Mail Bridge and its generated password for IMAP/SMTP access. Bridge requires an eligible paid Proton plan. No plan is purchased by the app. Use the installed local office on the same computer as Bridge, with 127.0.0.1, the ports and encryption shown by Bridge, and a trusted exported Bridge certificate if needed. Cloud hosting cannot reach Bridge on your computer. Documentation: https://proton.me/support/imap-smtp-and-pop3-setup

Remote mail requires certificate-verified TLS or required STARTTLS. TLS checking cannot be turned off. Connection credentials are encrypted in private files outside SQLite, excluded from database transfer and shared installers; the encryption key is on the same host, so host access can defeat that protection. Protect the whole data directory. OAuth tokens are supplied by the provider and must be renewed when they expire; this release does not register an OAuth application or implement provider-specific sign-in/refresh flows.

Test connection verifies access without sending. Prepare and approve a complete draft in Contacts & drafts. Connected email shows the exact sender, recipient, subject and body, then requires a separate Send confirmation. Approval for the old mail composer alone never causes automatic sending. The app limits sends to 20 per rolling day and enforces the do-not-contact list immediately before transmission. A transport timeout is Unknown; check your provider's Sent mail before creating another draft. There is no automatic retry of uncertain sends. SMTP acceptance is not proof of inbox delivery or reading.

Inbox access is optional. Check inbox headers manually or explicitly enable five-minute checks while the office process runs. Up to 100 headers are read per check. Exact reply references and the expected sender link a reply to a saved send, without marking it interested/accepted or trusting its content as instructions. Read the complete message in your provider. Message bodies and attachments are not imported. No real account or outgoing message was used during development validation.

## Pair web and installed offices

Both offices must run compatible preview.9 code. Sign into each using that office's founder login; passwords and session cookies do not synchronize.

1. In the office that will own ongoing research, open Web & local sharing → Create a one-use pairing code. Confirm sharing. The code expires in ten minutes.
2. On the second office, choose Pair this copy with my other office. Enter the first office's public HTTPS root address, one-time code and a device name. Confirm ownership and sharing.
3. The paired copy uploads/downloads bounded changes once a minute while running, including offline edits when it reconnects. Synchronize now runs additional batches. Large first transfers can take several cycles.
4. Review any conflicting records. Both versions remain saved until you choose which to keep. Stale conflict decisions are rejected.
5. Revoke a device at the shared office to invalidate its access. Disconnect at the paired copy to retain local data and resume standalone research.

Shared data covers company identity/goal/profile/design, employees, research tasks/evidence/current notices/contact research/CRM, drafts, outcomes, pricing, opportunity cases, business documents, invoice links, send receipts/inbox headers and do-not-contact addresses. Internal live worker/AI execution queues, alerts/learning state, source credentials, model installations, founder authentication, backup files and other host settings remain local. This is single-founder office sharing, not a multi-tenant platform or remote local-AI execution bridge.

The shared office runs research. A paired copy pauses its research worker to avoid duplicate execution, and its local AI is not exposed to the cloud. Approved email still requires that device's own private account connection and explicit send confirmation. Keep private off-device backups; synchronization is not a backup against accidental edits, lost hosts or free-host resets. No real offices have been paired and no live database has been migrated by this change.

## Release limits

Actual owner-device installation, DPAPI/import/shortcut/rollback behavior, provider mail/Proton access, remote HTTPS pairing, real microphones/cameras across restrictive networks, actual local-model quality and keyed live source validation still require target-environment checks. The Windows executable remains unsigned. This release adds real workflows and tests; it is not a certified complete commercial platform, bank/accounting connector, universal source crawler, multi-user identity system or guaranteed source of revenue. No paid service or OS startup registration is enabled.
