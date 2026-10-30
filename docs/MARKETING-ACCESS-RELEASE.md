# Preview.44 — marketing campus, connected/offline access and collaboration

## What this release implements

The Monetization & Marketing location has a dedicated renderer, not a headquarters theme. It is a two-story glass creative campus with an open central atrium, first-floor makerspace, upper balcony/railings, creator booths, data science and SEO stations, a strategy-to-creator workflow, and floor/overview controls. The creative studio covers social posts, internet campaigns and video/TV scripts through the existing saved-content workflow. The existing Bitcoin-design miner showpiece and morphing programmable-matter installation are preserved. Miner observations remain separate from the decorative coin/fabrication visualization; no actual mining or payout is invented.

Auto Post has a place in this office, but its connection is deliberately deferred by the owner. Do not connect, modify, run or publish Darius-Lea/Auto-Poster-AI as part of this release.

Marketing research can check a configured topic and up to five public SEO URLs on a six-hour schedule while clocked in. Actual public excerpts and HTML metadata pass through completed analyst → strategy → creator model runs and stop at owner review. Blocked sources/models remain blocked. This is not universal SEO/ranking analytics, engagement measurement, automatic video clipping or automatic publishing.

Shared accounts have unique office addresses, one-use invitations, owner/co-owner/coworker/visitor roles and revocation. Platform founder administration includes account suspension, timed holds, restoration, security observations, an optional ten-minute hold for authenticated rate-limit violations, terms text, and owner-issued one-use password-reset links. Reset links expire after one hour, invalidate existing sessions and do not remove a suspension. The owner must verify identity and share the link privately; no reset email is automatically sent.

The company phone provides distinct in-app LX numbers, an opt-in company directory, business introduction messages, answer/decline/cancel, coworker paging, live audio and per-side mute. The call bar remains mounted during office navigation. Company-name hiding requires platform-owner approval; users can stop accepting contacts themselves. These are app numbers, not public telephone/PSTN numbers. Voice needs compatible browsers, permission and a working network path; restrictive networks need TURN configuration. No production relay was provisioned and no calls are recorded.

Web/app update prompts and an updates/settings page are available. A supported Windows office can explicitly approve downloading the fixed official versioned installer, verify its SHA-256 and Windows file header, and open it. Existing installer logic stages versions and retains the separate data directory. No uninstall is needed. Windows still owns its normal installer/publisher prompts; this is not silent hot-patching. Checksum verification is not publisher signing.

## Internet and offline policy — owner's final instruction

New Windows installations set HQ_REQUIRE_ONLINE_ACCESS=1 and use the configured LeaX HTTPS account service. The local background service checks access every 15 seconds when reachable, retries failures with bounded backoff up to 30 seconds, and keeps trying while running. Browser online events also request a reconnect. App data can remain local while shared account, invitation, directory and calling requests go to the same authoritative hosted service used by website users. Invitation links use that shared host, not localhost.

A successfully verified active account may work offline for seven days from its last successful access check, including closing/reopening the app. The encrypted local record retains that last verified decision. After seven days, the installed office and native browser restrict the user to the setup lobby until online verification succeeds. A returned suspension/revocation takes effect immediately rather than waiting for the offline week. Agent claims/new background work stop when access is held; model runs and browser permissions are stopped. A powered-off computer cannot run reconnect checks; elapsed offline time still counts. The future offline access-code override is intentionally not implemented.

Older already-distributed standalone installers do not acquire this gate until updated. Original project sources/tests/maps/credentials are excluded from the customer production package. A determined device owner can still inspect or modify client artifacts; authoritative hosted permissions and future billing must be enforced on the server. Do not advertise absolute reverse-engineering prevention or a tamper-proof commercial licensing system.

## How to manage accounts

Use Platform access & security in the founder-authenticated shared website. It is the server hosting the accounts that applies suspensions and privacy decisions. A normal user or office co-owner cannot grant platform-founder access. The same website can be opened from the desktop browser. A separate local development database is not the hosted account database.

For recovery, select the registered account and Create private password reset link. Send it through a verified private channel. The recipient opens it, sets a new password and signs in. Email verification, automatic email recovery and account deletion/export are separate unfinished customer-platform work.

For invitations, enter a shared office, choose a role and create/copy a personal one-use invitation. It lasts 24 hours. Shared membership grants room presence, messages and authorized phone access; it does not grant editing of the founder's private business records.

## Still required before a market-ready/public-readiness claim

- Deploy this server version and build/verify the new Windows installer; then validate on actual Windows hardware and the public HTTPS host. Do not give a friend a readiness guarantee based only on cloud/local tests.
- Durable hosted storage, private backups, production access-service availability and a suitable authenticated TURN service for reliable cross-network calls.
- Public signup hardening, email verification/automatic email recovery, privacy/terms and account lifecycle review, signing and fuller licensing/tamper review. No payment provider, paid plan or billing was enabled.
- Guest links that join camera meetings without ordinary account registration, the requested whole-screen guest office view/avatar representation, and permission-before-agent-speaking to guests with AI audio routed into the remote call. Existing human-call camera features are separate from the new audio company phone.
- Faster live model responses require hardware/model measurement and possibly streaming inference/speech. AI meeting polling now checks pending replies more promptly, but no guaranteed response time or live-model speedup is claimed. Agents are still processed sequentially by the selected model.
- Automatic detection of every malware, hacking, prompt-injection or terms violation is not implemented. Alerts are concrete security observations and explicit access decisions, not proof that arbitrary text is malicious.
- Full shared editing of company leads/documents/tasks, advanced meetings and commercial entitlements remain unfinished.
- Live universal trend/SEO analytics and video acquisition/transcription/clipping/automatic publishing remain unconnected. Auto Post is deferred by owner instruction. Actual mining hardware/payouts remain unconnected.

## Next phase, explicitly after this push

The owner requested passwordless temporary guest tours/showings, mobile entry, manifesting visitors into the live office, host-click visibility, following/independent walking, permitted feature trials and joint office travel for recruiting/investor demonstrations. Record these as future work; do not imply the current shared-room presence already synchronizes these actions.
