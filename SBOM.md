# Dependency and license inventory
- Application npm dependency: Three.js **0.180.0**, MIT, pinned in package.json/package-lock.json. Source: https://github.com/mrdoob/three.js . Full notice in THIRD_PARTY_NOTICES.md and installed package. No external 3D assets/fonts required.
- Runtime: Node.js 24.x (MIT plus bundled notices); portable Windows wizard pins 24.19.0 and verifies official SHA-256 + Authenticode. Consult Node distribution LICENSE before redistribution. SQLite bundled with Node is public domain.
- Optional Ollama runtime: MIT application, installed by the owner with its official installer. Optional qwen3:0.6b model is separately downloaded only on owner confirmation; upstream Qwen3 licensing/model terms apply (Apache-2.0 for the Qwen3 base weights; verify the chosen model's card before redistribution). Models are not included in the repository or installer package.
- No mandatory paid AI, telephony, UI or hosted backend service. SAM.gov uses a free external account/API key with official quotas.
- Development-only browser tooling installed under /tmp: Playwright Core / Chromium, not application npm dependencies or redistributed binaries.
- npm audit --omit=dev: zero reported vulnerabilities on 2026-10-21. This is not a security audit.

No application-source license has been assigned on the owner's behalf; keep owner-controlled source private as intended. Review distribution notices and model licenses before commercial packaging.
