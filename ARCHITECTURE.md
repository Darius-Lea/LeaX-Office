# Architecture

## Preview.11 employee presentation

A small first-party SVG module renders deterministic portraits locally from saved employee IDs, with transparent background, text-safe labels and explicit show/hide/speaking/dispose methods. The focused-window controller owns one portrait at a time, disposes it on content/employee changes, and suppresses it while either meeting-room view is active. No image fetch, GPU renderer or idle JavaScript animation loop is introduced for portraits.

The meeting speech controller uses a separate busy flag during voice preparation; its speaking ID is set only by actual playback status. Existing shoulder/elbow/palm joints animate the one speaker's hand, with finite transitions/static reduced-motion poses and neutral cleanup. Saved work/model execution remains separate from avatar presentation. Video still uses the scoped same-origin camera panel and its existing permissions.

## Preview.10 CEO-led turns and embedded board

The additive office_meeting_turns table links each response message to the exact saved CEO question and employee. Meeting call/start only record invitations and state; older clients cannot request automatic kickoff inference. Existing completed outputs remain intact. Legacy unstarted pre-question kickoff slots are withdrawn separately from explicit discussion. Inference selects the actual question and that employee's bounded prior turns, removes unrelated docket data, retains relevant source tools and rejects unexpected tools on simple questions. Response metadata distinguishes linked questions and legacy unsolicited kickoff history.

A single movable composer retains unfinished input between room and popup board. The CEO's board separates discussion/agenda/people/video/voice/history; scene hits open the same board or select a colleague. The discussion log scrolls independently above visible reply controls. Human video reuses the scoped partner UI in a sandboxed same-origin frame bound to the actual meeting and current session. It does not navigate to an external provider. Device startup and parent/child messages have consent/origin/source/generation guards; removing the panel stops media. Same-origin framing is allowed while third-party framing remains prohibited.

Speech inventory subscriptions update delayed voices and preferences without playback. Device voices are default. Optional browser online English voices require persisted explicit text-sharing consent; revocation stops current online playback and blocks later chunks. No provider SDK, TTS model or online endpoint is bundled.

## Preview.9 office extensions

Meeting, participant, message, response-request and idempotent mutation tables preserve workflow independently of 3D avatars. Local response slots map to actual ai_runs; clerk summaries are separately labeled. Employee conversations and meetings share the bounded serialized local-model executor, clock gates and actual tool receipts. Grounded lead/status preflight happens before inference; one repair precedes a blocked output. Small models receive compact selected evidence instead of unrelated office state.

Profile-assist requests preserve owner descriptions and source quotes; reviewed apply requires an unchanged profile snapshot and explicit overwrite approval. Teaching previews/examples are private retrieval data, not executable dataset code or model weights. New teaching/meeting counts appear in the knowledge breakdown; their contents remain excluded from generic encrypted GitHub learning archives.

Separate hashed partner sessions cannot authenticate founder APIs. Scoped meeting messages/presence are distinct from explicit WebRTC camera/microphone consent. Recipient-limited ephemeral SDP/ICE signaling is not proof of a connected media channel. Public support requests are plain text and rate limited, with no attachments or automatic membership/booking. Manual external-payment review never writes business cash receipts. Bitcoin lookups use a fixed public API, validated mainnet addresses and durable global pacing; no wallet keys, miner or pool exists.

Browser extensions load first-party room/media modules locally. YouTube is consent-loaded in a privacy-enhanced frame. Speech may involve the browser vendor only after per-turn consent; read-aloud restricts installed local English voices. Canvas/MediaRecorder renders a real silent WebM locally. The primary office scene pauses while the full-screen meeting scene is open; unchanged/hidden scenes avoid redraw and clean up GPU resources.
Node 24 native TypeScript + built-in HTTP/SQLite; npm-pinned Three.js modules served locally, no frontend build step or CDN. SQLite data, employee configuration, notes, tasks, checkpoints and audit history persist outside local app versions. Existing schemas migrate additively.

worker.ts handles bounded Alpha collection and Bravo provenance review with transactional page checkpoints. team.ts produces source-linked register/checklist/unsent drafts/briefings. manager.ts checks leases, handoffs and outputs with a persisted throttle and deduplicated alerts. office.ts gates authorized processing on saved clock state; background.ts supplies the same loop without a web server. Source, model and internal work have distinct status/evidence.

research.ts is historical USAspending awards. solicitations.ts is separate SAM.gov current-notice search with a free external API credential, strict deadline/activity/type/freshness classification, separate history and sanitized errors. It never classifies award notices as bids or infers company eligibility. Missing credentials remain explicit.

advice.ts supplies deterministic service-fit and next-action screening; original source evidence stays unchanged. ai.ts executes actual fixed-loopback Ollama chat inference with bounded prompt/context/output, installed-model validation, durable states, retry ceilings and cycle-associated grounding. External content is untrusted. The model receives no action tools, secrets or permission-changing authority. AI outputs are labeled advisory notes, not completed actions. Optional small-model installation is explicitly confirmed and separate from startup.

contacts.ts is a bounded public-page reader: HTTPS, validated/pinned public DNS, verified TLS, crawler robots rules, same-origin redirects and request/response limits. No guessed contacts or private browsing. drafts.ts requires a current published contact or a fresh official open-review notice contact, then owner review before opening a mailto composer. There is no sender or bid-submission tool.

public/office3d.js renders a procedural WebGL office with local assets, orbit/zoom and recorded manager motion; office.js lazy-loads it with honest clerical fallback. Idle/hidden rendering pauses and pixel ratio is capped. UI preserves edited draft text across polling and keeps source datasets distinct.

Start-AI-Headquarters.cmd invokes a Windows user-local PowerShell wizard with signed/checksummed portable Node, locked npm dependencies, versioned code, stable SQLite directory, DPAPI-protected credentials and private one-time fragment bootstrap. Source updates do not reset the DB. Explicit backup import validates/stages and archives existing state. OS operations remain untested on Windows; this is not a finished signed native package.
