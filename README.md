# AI Headquarters
A founder-controlled business office for LeaX LLC / American Power Global. This is an actively developed application, not a completed autonomous company.

## Start without coding on Windows
In the signed-in office, choose **Set up this computer / local AI → Download Windows setup (.exe)**. Open **AI-Headquarters-Setup.exe** and choose **Install / open office**. This native Windows x64 setup uses a graphical window, with no PowerShell script or terminal. It installs a checksum/signature-verified portable Node runtime and locked dependencies, then opens your private local browser office. No Render, coding, administrator account, paid API or automatic model download is required. The executable is **unsigned**; Windows may show an unknown-publisher warning. Its actual Windows installation still needs validation on a Windows device.

Data stays in `%LOCALAPPDATA%\AIHeadquarters\data`, separate from installed versions. Download your private database backup from the existing Render office and use **Import saved office from Render / backup** in setup to retain your founder login, tasks and notes. Import validates and stages the selected database and preserves existing local files/recovery copies. It never synchronizes silently. Read [LOCAL_INSTALL.md](LOCAL_INSTALL.md) for transfer, updates and limits.

## What research means
- **Historical awards:** live USAspending API results record contracts issued to other companies. They can identify potential prime-contractor partners, not open work or money awarded to APG.
- **Current notices:** a separate official SAM.gov API connector needs your free account's SAM_API_KEY. Use the Windows wizard's optional masked key field (Windows-user DPAPI storage), or secure environment settings on the app host. Missing credentials show Setup required. No key is stored in the application database or requested in chat. Active appropriate notice type + future explicit-time-zone deadline + fresh source check gives Open for review, not bidding eligibility. Read [SOLICITATIONS.md](SOLICITATIONS.md).

Both searches run bounded cycles every six hours while clocked in and the host is awake. Historic search caps at 3 x 20 records; current-notice search caps at 25, searches the last 30 calendar dates and rotates one mapped title phrase per query. These are incomplete nationwide/overseas federal sources, not all private or global rollouts. No SAM key is configured in the development machine; no live current-bid success is claimed.

## Assistant and agents
Award cards screen service fit and explain what to do next. Einstein's saved briefing prioritizes relevant records and explains verification, vendor onboarding, capability preparation and economics. A generator or sprinkler keyword match is not automatically an IT prospect.

Genuine model-driven assignments use local Ollama `/api/chat`, with installed model selection, durable queued/running/completed/blocked states, bounded context/output, evidence grounding and saved AI-labeled notes. Install Ollama with its official installer, then use **Set up this computer / local AI**. A small optional qwen3:0.6b download requires an explicit confirmation (about 0.5–0.7 GB); quality is limited and stronger installed models can be selected. No model downloads automatically. Hosted Render cannot reach Ollama on your PC. Successful live inference has not been tested here because Ollama/models are absent; protocol/persistence tests use synthetic responses.

Evidence collection, deduplication, deadline checks and scheduling remain deterministic tools. Model advice is not automatically factual or authorized action. Per-cycle model advice uses that cycle's linked evidence; manual assignments can review recent business context. Marketing requests produce scripts/storyboards, not rendered cinematic video, and no ChatGPT/Claude account is connected.

## Contacts and owner-approved email preparation
In Owner computer, supply an official public contact-page URL. The app respects robots rules, resolves and pins public HTTPS addresses, limits requests/size/time and saves only published emails/tel links with source URLs. No email or decision-maker identity is guessed; listings are not verified permission, role ownership or deliverability. It does not autonomously discover every company website or scrape private indexes.

Prepare an introduction only from a saved published email, edit it and approve it. A fresh official open-review SAM notice can also supply a contracting inquiry draft from its published contact. Approval enables opening the owner's mail app. The owner makes the final send decision; this app never sends email or submits a bid. Editing resets approval. Original evidence is preserved.

## Office and management
A genuine locally served Three.js WebGL office provides orbit/zoom, bodies/faces, computers, chairs, windows, meeting area, employee inspection and an owner computer. The manager walks to recorded patrol targets; indicators reflect actual work, including model runs. Graphics lazy-load and pause when idle/hidden; clerical/terminal modes remain available. It is a procedural stylized office, not a photorealistic simulation.

Seven editable roles have real bounded tools: Alpha research, Bravo provenance, Juliet company register, Morgan qualification checks, Delta unsent drafts, Einstein briefings, Johnson 60-second queue/handoff patrol. Missing tools, blocked work, normal idle time and external approval remain explicit. No owner subscription employee cap. [OPERATING_MODEL.md](OPERATING_MODEL.md) distinguishes current functionality from the full revenue workflow still to build.

## Developer startup
Node 24.19+ within 24.x: `npm ci --ignore-scripts`, `npm test`, `npm start`. Optional standalone `npm run worker` runs the same office loop. Use one processing mode at a time. The app binds loopback by default on port 4310; Render/public mode requires HTTPS origin/private bootstrap settings described in [DEPLOYMENT.md](DEPLOYMENT.md).

SQLite keeps work across restarts only when its directory is retained. Download an authenticated private database backup to transfer an existing office; Windows wizard import requires a stopped office, verifies/stages the backup, and preserves previous local files/recovery copies before replacing. This is explicit transfer, not cloud synchronization. Free Render's ephemeral filesystem and sleep remain unsuitable for reliable durable always-on work. Keep private off-device backups. No paid hosting, accounts or billing are automatically enabled.


Owner computer now contains Inbox, Assistant, Contacts & drafts, Company & research, and Print-ready packets. Packets include task-linked evidence, owner notes, employee handoffs and advisory next steps, with company branding and a decorative review seal. Use Print / Save as PDF or save a readable HTML copy. Research lanes now include construction cleanup and healthcare installations; only the untouched original standing objective is expanded automatically. Customized directions are retained. Background refresh rotates applicable service lanes.

Local-model runs can execute allowlisted research/read tools: saved evidence and tasks, official current-notice search, and queueing a real historical-award assignment. Each call saves a receipt; queued research is not completed research. Loops are bounded to four model responses and six calls; unsupported actions and invented reference URLs/emails are blocked. This does not connect all bid sites, general autonomous browser use, private contact databases or outgoing communications.
