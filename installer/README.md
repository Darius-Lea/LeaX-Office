# Native Windows setup

`main_windows.go` is an unsigned native x64 GUI, cross-built with Go. `database-restore.mjs` validates and copies SQLite backups using the verified Node runtime. `scripts/build-native-installer.py` builds the Common Controls resource and embeds an allowlisted application snapshot; generated payload/resource files are ignored. The committed executable is in `downloads/` with SHA-256 sidecar.

This is not code signed and has not been executed on Windows in this Linux workspace. Hidden child processes do not change Windows execution policy. Runtime downloads require official HTTPS checksums plus successful Windows Authenticode verification. No model, paid service, external sender or OS startup task installs automatically. Existing data stays outside application versions. Backup import requires explicit replacement confirmation, a stopped office, schema/integrity checks and a recovery/archive path.
