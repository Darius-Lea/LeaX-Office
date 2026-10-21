# Known issues
- No actual opportunity search/extraction or local inference yet. Current task completion is intentionally blocked after source review.
- Live www.usaspending.gov unavailable: direct Node fetch DNS EAI_AGAIN; environment proxy request cancelled. No successful live source validation.
- Worker processing requires a running process; no automatic schedules or UI controls yet. A recent heartbeat is not proof a specific task is running.
- Manual backups only; no rotation, automatic backups or recovery wizard. Loss of the data directory loses business state. Keep off-device private copies.
- Windows task registration script not tested. Cannot validate Windows behavior in this Linux environment.
- No browser E2E test or TypeScript type checking yet; tests execute native TypeScript directly.
- Local-only single-founder app; do not expose publicly. No SaaS tenant isolation, password recovery or email verification.
