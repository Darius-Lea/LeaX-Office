# Run and recover
From repository root with Node 24.19+: npm ci; npm test; npm start. In another terminal npm run worker to explicitly enable research. Cloud environments do not need additional worktrees. Future tasks must restart processes; snapshots do not preserve them.
The app is loopback only, HTTP for local use. Do not bind publicly or use it as a production SaaS deployment. PORT defaults to 4310. HQ_DATA_DIR defaults to data/ under working directory. Keep startup working directory consistent.

Stop worker/server before manual restore. Preserve original data directory. Copy a verified backup to a new private directory as headquarters.sqlite, then start with HQ_DATA_DIR pointing there. Do not combine a restored database with old -wal/-shm files. Run PRAGMA integrity_check and inspect tasks before restarting worker. Lease recovery can take 60 seconds. Backup restore is exercised in npm test. Backup contains password hashes and business data; protect it. UI backups are not an off-device disaster recovery strategy.

Windows: install Node 24.19+, run commands from project root. Optional scripts/windows-worker.ps1 registers a worker at sign-in only when manually executed. Stop and disable via Stop-ScheduledTask AIHeadquartersWorker and Disable-ScheduledTask AIHeadquartersWorker. Remove via Unregister-ScheduledTask when appropriate. Windows behavior remains unverified.
