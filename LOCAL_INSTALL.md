# Install AI Headquarters on Windows

Preview.6 keeps your existing office database and adds **Opportunities** in the owner computer. Open a source lead and choose **Track potential partner**, or add a customer you already know. Keep the next action, follow-up date, qualification checks and reported results together. Today opens the specific opportunity that needs attention. Historical awards remain potential-partner research, and reported wins remain separate from received payments.

**Protect your saved office** shows the latest verified automatic backup and offers a private download. Daily backups retain seven managed copies on the same host, including while business work is clocked out. Keep a downloaded copy on another device or drive; these local copies cannot survive a lost disk or free-host reset. Research and assignment history now have search and page controls; older records remain in the database.

Use the **native Windows x64 setup executable**, not GitHub’s source ZIP or the old `.cmd` launcher. The old PowerShell launcher can be rejected by Windows signing policy; the native setup does not execute PowerShell or change that policy.

1. Visit your app website’s **/download** page and choose **Download for Windows**. The page shows real transfer progress and checks the file before handing it to your browser to save. Cancel and retry are available; a direct browser link remains a fallback. Existing host: https://leax-office.onrender.com/download . No sign-in, ZIP extraction or project-folder browsing is needed.
2. Open `AI-Headquarters-Setup.exe`. It is unsigned: Windows may show an unknown-publisher warning. Only use the app owner’s official download site or your own repository. Actual Windows installation remains unvalidated in this Linux development environment.
3. Setup starts automatically when the downloaded executable opens; **Install / open office** is available for reopening/retry. The office opens before the large AI downloads; keep the setup window open for automatic AI preparation. Research and saved files can be used while AI is being prepared. It downloads official portable Node, verifies SHA-256 and Windows Authenticode, verifies the complete production app and opens a local app-style browser window at `http://127.0.0.1:4310`. Downloads require internet; no terminal or administrator install is needed.
4. Existing local data is reused. For a new office, choose your founder password; setup supplies the private one-time code in a local fragment and the app clears it from the address. No code is published or sent in a query string.
5. To preserve your Render office, first download its private SQLite backup in Owner computer → Company & research, stop the local office, then choose **Import saved office from Render / backup** in native setup. Confirm replacement after choosing your trusted backup. The helper validates schema/integrity and stages a consistent copy. Existing local data receives a verified recovery backup and an archive before replacement; failed replacement restores originals. Start again and use the imported founder password. No automatic cloud sync occurs.

The native executable is x64, intended for Windows 10/11 x64; ARM64 native packaging is not yet supplied. It has cross-compiled successfully, but Windows GUI/runtime/signature/DPAPI/shortcut/import execution still requires Windows device validation. Signing policy or endpoint protection may require your administrator’s approval; setup does not bypass them.

## What is installed and kept

Everything is user scoped under:

`%LOCALAPPDATA%\AIHeadquarters`

- `data`: durable SQLite database and local backups. **Keep this folder.** It is outside application versions, so updating code does not create a fresh founder account or erase prior work.
- `versions`: separate application versions. Existing versions and any edits are not overwritten. Old versions are retained for recovery.
- `runtimes`: portable Node 24.19.0, selected for your Windows architecture. No system Node installation or PATH change is required.
- `downloads`: runtime download cache. Customer setup no longer installs npm dependencies; an old `npm-cache` folder may remain from an earlier version.
- `sam-native.dpapi` (native setup; old script uses `sam-api-key.dpapi`): optional SAM.gov API credential encrypted with Windows DPAPI for the current user. It is separate from process state and is never loaded into the visible wizard field.
- `native-state.json` (native setup; old script uses `server-state.json`): process identity and, only during first setup, a setup code encrypted for your Windows user with DPAPI. It is not portable to another Windows user.
- `recovery`: verified pre-import database backups and archived original SQLite files kept when you explicitly import a backup.
- `server-native.log`, `install.log`: local diagnostic logs. Do not publicly share logs without checking them for private information.

The local folder's permissions are restricted to your Windows user, SYSTEM and Administrators. The database itself is not application-encrypted. Protect your Windows account and disk. Copy verified backups to a private off-device location: local storage can still fail, and deleting this folder loses local business data.

The server binds only to `127.0.0.1:4310`; it is not opened to your Wi-Fi network or the internet. Your ordinary Wi-Fi/internet connection is used for permitted public research. A setup fragment in the browser URL is used only locally and is never sent as a URL query to the server; the app clears it after reading it.

## Updating and stopping

To update, use **Stop local office**, close the old setup window, download the newer executable and choose **Install / open office**. A new app version is prepared while the data folder stays unchanged. A healthy current version opens immediately; an update prepares its verified dependencies before replacing the owned running server. Keep a verified database backup before major updates.

Closing the browser or setup window leaves the local server running while Windows is awake. Use **Clock out** inside the app to pause new work. Use **Stop office** in this launcher to stop the process completely. The launcher verifies the saved process ID, executable, start time before stopping it; it never kills an unknown process occupying the port. Interrupted read-only work can recover from saved checkpoints after restart.

There is no automatic Windows login/startup registration in this wizard. Restart Windows, then use the desktop shortcut to start again. The existing optional Task Scheduler integration is a separate, explicitly authorized setup.

## Bring an existing office database to this computer

This is an explicit backup/import workflow, **not automatic cloud synchronization**. Do not start over with an empty database if you want to retain your current founder login, tasks and research.

1. In the office you already use (for example, Render), sign in and choose **Download private database backup / transfer to local app**. Save the resulting `.sqlite` file privately on this computer. It contains founder password hashes and business records; do not post or email it publicly.
2. In the Windows launcher, click **Stop office** if a local office is running. Import is blocked while the launcher's office process exists or anything still uses local port 4310.
3. Click **Import saved office from Render / backup** and select the trusted `.sqlite` file you just downloaded.
4. The launcher verifies SQLite integrity and required app tables/columns using portable Node. It prepares a consistent staging copy without editing your selected file, then asks for explicit confirmation. Confirm only if you want the imported founder login and records to replace the current local office.
5. Before replacement, an existing local database receives its own verified recovery backup. The old database and any matching `-wal`/`-shm` files are archived under `%LOCALAPPDATA%\AIHeadquarters\recovery\<timestamp>`. Existing ordinary backup files stay in the data folder. A same-volume rename installs the validated staging database; it never copies over a live database. Failed replacement attempts try to restore original files and retain recovery copies rather than deleting business data.
6. Click **Start / open office** yourself after import. Sign in using the **founder password from the imported office**. Import does not automatically start a process, send emails or authorize new accounts.

No current local database means there is nothing old to replace; the staged backup still must pass validation. If the existing local database is corrupt, preservation cannot be verified, unexpected files appear, or rollback needs review, the launcher stops with a recovery message. Keep the selected backup and recovery folder and do not start a second copy until the issue is resolved.

Only import a backup from your own trusted AI Headquarters instance. Read-only input verification checks integrity/schema, not the trustworthiness of every business record or third-party source inside it. Private access keys are not migrated by the database; enter them again in Owner computer → Connections after transfer. Windows-user DPAPI secrets also remain separate from the database. The local app does not synchronize subsequent changes back to Render.

The embedded Node verification/backup helper was exercised on Linux with real SQLite fixtures: read-only WAL source backup, standalone checkpointed staging copy, required schema/integrity, source preservation, rejection of unrelated/corrupt databases, and refusal to overwrite a pre-existing destination. Actual Windows dialog, filesystem rename/rollback and process-ownership checks remain untested.

## Optional current government bid search

Current SAM.gov opportunities require a SAM.gov API key; public historical award research is a separate source and is not a list of open jobs. You can use the local office without entering this optional key, but current government opportunity search will show Setup required until authorized.

1. Open Owner computer → Connections, or click a missing-SAM-access alert. Follow the account/profile instructions to request your own free key. The application does not create an account for you or bypass SAM access limits.
2. Paste the complete key into the masked field and choose **Save private access**. The field is cleared after use; saved secrets are never prefilled. Do not paste the key in chat.
3. Choose **Check federal opportunity access**. Saving makes it available immediately without restarting; checking confirms whether the official source accepts it. A saved key alone does not prove a successful search.

In the installed Windows app, the native helper protects the saved key with Windows-user DPAPI. It stays outside the database and process-state files; it is decrypted privately on later starts. This Windows encryption path still needs actual device validation. The launcher's optional key field remains a fallback; saving there applies at the next office start.

The web office also accepts private entry. It encrypts the value in the office data folder rather than SQLite; keep that folder private. Free Render can lose the folder on a hosting reset, requiring the key to be entered again. Private keys are excluded from database backups, imports and shared app downloads. No secret value is printed or logged.

SAM.gov accounts/API usage are subject to GSA rules and rate limits. The key permits authorized read-only public opportunity requests; it does not authorize emails, bidding, signing contracts or paid services. Follow the official limits and verify notices, eligibility and deadlines before any submission.

## AI and resources

The office opens first. The native setup then automatically downloads its private AI engine and RAM-selected starter model and saves the connection only after a genuine inference check. The office health line distinguishes unfinished, paused and failed AI setup. If AI preparation fails, use **Install / open office** in setup to retry; the opened office and its saved records remain available. Retry stages a fresh verified runtime when a cached Node or AI runtime is damaged, retaining the old runtime files separately. Separate Ollama installation and manual model selection are unnecessary. GPU support and model performance are not guaranteed; inference uses more memory than the Node/browser interface. Model controls remain available for advanced users.

The browser/Node architecture avoids bundling a second Chromium runtime, as an Electron app would. Actual memory use depends on your browser, 3D mode, data volume and optional model. Choose the clerical/terminal view on low-powered devices. Work stops when your PC is powered off or asleep; the launcher does not change power settings or prevent sleep.

First setup needs HTTPS access to `nodejs.org`, the pinned official Ollama release assets and the model registry. The runtime archive is checked against Node's official `SHASUMS256.txt`, and Windows verifies `node.exe`'s Authenticode signature. AI engine and production app integrity checks are retained; customer setup does not run npm. Verification errors stop installation rather than accepting an unverified executable. No VPN, proxy credentials or paid service is configured.

## Current validation limits

Historical note: the older PowerShell source launcher passed parser checks only. It is no longer the customer install path. The current native executable cross-compiles and production/browser tests pass, but Windows OS certificate checks, DPAPI, startup/stop and shortcuts still need actual Windows validation. The executable remains unsigned; macOS/Linux packaging and automatic cloud synchronization are not implemented.


## Rebuilding the native setup (developers only)

Run `python scripts/build-native-installer.py --go /path/to/go` with Go 1.24+ and Python. The build embeds the standalone production application and required setup helpers/notices, excluding original source folders, development documents, databases, secrets, caches and downloads. Go dependencies and resource tool are pinned; the build produces the Windows GUI executable and SHA-256 file. It does not sign or execute the result. Rebuild after changing bundled app code or assets.


## Built-in AI — no separate installation or connection

Opening the executable starts setup automatically. It verifies and extracts official portable Ollama v0.40.7 from the pinned official release SHA-256, starts it on the private `127.0.0.1:11435` endpoint, selects Qwen3 0.6B / 1.7B / 4B based on total RAM, downloads the model, runs an actual short inference check and saves the app connection. No separate Ollama app, API key, model selector or terminal is needed. Allow roughly 2–5 GB of first-time downloads, at least 12 GB free disk and at least 4 GB RAM. Speed/quality vary. Internet failures or unsupported hardware show a setup error; they do not create fake AI outputs. Model pulls can resume; completed models persist.

The engine is app-private under `ai/`, models remain under `ai/models/`, and `ai-process.json` tracks only the owned engine. A pre-existing system Ollama service is neither stopped nor reconfigured. Stop local office stops the owned app and owned engine; closing the browser/setup leaves them running while Windows is awake. No Windows service/startup registration or cloud AI is enabled. The SAM key remains optional and owner-provided because it belongs to a personal SAM.gov account; it is not needed for historical awards or local AI.

The native Windows flow remains cross-compiled and unexecuted here. Pinned release metadata/checksum were fetched from official GitHub release assets, but downloading/running the Windows AI engine and actual model inference have not been validated on a Windows device. The app executable remains unsigned.


The office now opens in a separate app-style window with a trusted installed Edge/Chrome browser where available; otherwise it uses your normal browser. Setup does not read or modify browser profiles. Cancel setup pauses downloads/foreground helpers safely and preserves saved records and completed model downloads. The production package includes no original project folders or personal business database; executable/browser internals are still inspectable, as with installed software generally.

## Add federal access inside your office

Open Owner computer → Connections. It explains why current federal jobs need your free SAM.gov account’s key and how to request it. Paste a replacement key into the masked field and choose Save private access, then Check federal opportunity access. No terminal, host settings or app restart is needed. On installed Windows, the native helper encrypts it for your Windows user; neither the visible app state, database, logs nor shared download receives the value. The key is used in memory for the running office and decrypted privately on later starts. Windows private-pipe encryption remains unvalidated on a Windows device; the web office uses encrypted files in its private data folder and can lose them on a free-host reset. Historical award research, built-in AI and the public funding connector do not require this key. Do not share keys in chat.


Office remodeling is saved in the same database as your work, so a retained or imported office keeps its design. After updating, use the Remodel control for finishes, desk layout, monitors and furnishings. Focused advice opens in a popup; Read to me uses a locally installed English voice when your browser supports one.


Preview.5 adds the Live operations side monitor. It shows actual running work, the manager’s next assignment, saved business counts and source waits. Reward useful work or Correct & retrain applies only to a saved work receipt; the persisted model learns which eligible job recipes to prioritize. Source waiting, required approvals and setup do not earn penalties. The manager assigns bounded follow-through and research automatically while clocked in; clock-out and host sleep still pause new work.
