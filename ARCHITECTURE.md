# Architecture

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
