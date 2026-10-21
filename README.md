# AI Headquarters
Early local foundation for LeaX LLC / American Power Global. This is an incomplete Phase 1 application, not a finished business acquisition platform.

Requires Node 24.19+; no third-party runtime dependencies. Run `npm ci`, `npm test`, then `npm start` from the repository root. The server binds only to loopback port 4310. Use a local browser on the host machine. First launch prints a one-time setup code in its terminal; use it to choose a password of at least 14 characters. The cloud onboarding interface does not provide an application preview.

Run `npm run worker` in a second terminal only when you want processing. Stop with Ctrl+C. It persists each checkpoint and recovers expired 60-second leases. Tasks currently check the availability of one public research source and hand the evidence to Bravo; Bravo blocks the task because opportunity extraction is not implemented. Failed research is explicitly reported. It does not discover leads or perform model inference yet.

Data stays in `data/headquarters.sqlite` with WAL sidecars; set HQ_DATA_DIR to an absolute private directory to relocate storage. Keep this folder across restarts. UI backup uses SQLite's online backup API. No automatic rotation or off-device backups yet. See DEPLOYMENT.md. No paid services or external accounts are required.

Windows users can manually opt in to the sign-in worker using scripts/windows-worker.ps1. The script is untested on Windows and is never run automatically. Ollama availability/model detection is exposed by the authenticated health endpoint, but inference and model selection are unfinished.
