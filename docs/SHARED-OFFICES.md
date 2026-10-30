# Shared offices and the LeaX browser — preview.43

This version adds collaboration rooms alongside the private founder business workspace. They do not expose the founder's company database to registered users. Registration uses a username and a 14–256 character password; email verification, password recovery and federated sign-in are not implemented. Keep your password safe. Do not advertise this preview as a production customer account platform.

## Meet a colleague across desktop and website

1. Deploy this version to a durable HTTPS app host. All participants must use that same host. The repository's existing published host is `https://leax-office.onrender.com`; its current deployment has not been verified by this task. An old deployment will not have `/offices`.
2. In the installed LeaX browser, open that host's `/offices` page and create your personal account. Every account receives its own private room and random digital office address. You may create up to ten rooms. This account is separate from the local founder login.
3. Open your room, choose visitor, coworker or co-owner, and create an invitation. Copy the invitation link to your colleague through your preferred channel. The app does not send it automatically.
4. Your colleague opens the link on the website and creates their own account or signs in. The invitation is single-use and expires after 24 hours. It grants membership only to that room. The digital address alone does not grant membership.
5. Both participants now see each other under Here now, can enter the virtual office/meeting room and can exchange saved room messages. Presence refreshes every five seconds and expires after 45 seconds without a heartbeat. This is shared room presence, not synchronized walking positions, screen sharing or a new audio/video call integration.
6. Owners can assign co-owners, coworkers and visitors or remove members. Co-owners can invite/manage coworkers and visitors, but cannot modify the owner or other co-owners. Visitors/coworkers can enter and converse; neither can administer membership. All roles are checked by the server. Private business documents, credentials, research and company editing are not shared by these memberships. Existing explicit device-pairing remains a separate owner workflow.

Localhost URLs cannot be used by a friend on another device. The local `/offices` page provides links to the existing shared host and installed LeaX browser. Registration is local to each host: opening a separate local server does not create a shared public room. Do not expose your local founder server as a workaround.

Accounts, hashed passwords, sessions, rooms, memberships and messages live in the host's SQLite database under `HQ_DATA_DIR`. Use durable storage and private backups. Free ephemeral hosting can lose these records on restart/redeploy; sleeping or offline hosts stop live presence. No new paid hosting, account, email delivery or billing was enabled.

## Browser and assistant

The private office starts with the computer closed. Clicking the computer opens its desktop. The LeaX Browser shortcut directly opens installed Chromium where available; the web version opens a separate browser workspace without CCL introduction. The full native browser supports 32 simultaneous tabs, popups as tabs, a saved site profile, explicit data clearing and a new-tab page linking Proton Mail, DuckDuckGo, public investigation resources and AI/business news publishers. Links are shortcuts, not a live news feed or provider integration.

The web workspace has independent page-view tabs. Site framing and third-party cookie restrictions still apply; its full-tab/installed-browser controls provide a fallback. It cannot inspect cross-origin iframe contents or bypass site login rules.

The movable assistant stays above native page content. Drag its grip, open it, and type a question. It uses real selected-model inference with bounded tool calls and saved outputs. The web assistant requires founder authentication and can use a verified paired worker. The native assistant uses the existing local bridge and local model. A missing model produces a setup error, never a simulated reply.

Voice is opt-in and depends on the browser supporting speech recognition and device speech. Recognition may use the browser provider; this is disclosed before enabling it. Electron may not support recognition: typing remains available. Mute stops reply playback. Stop ends recognition/playback, aborts local in-flight inference, blocks late outputs/future model tool calls and stops the active browser permission. A previously completed external action cannot be undone by Stop. Closing the app interrupts live voice and presence.

Signed-in page reading/navigation/scrolling still requires the existing owner-approved lead/site/scope grant. Tab changes revoke the native in-memory grant so it cannot silently follow another tab. This is bounded browser tooling, not universal computer control. An in-progress bounded source/tool operation may finish; Stop prevents subsequent steps and discards a late model answer. Actual on-device natural voice, real model/browser research and Windows protocol launch still require target-device validation.

## Run and verify

Use Node 24.19.0 or a compatible 24.x release. From the existing checkout:

```
npm ci --ignore-scripts
NODE_USE_ENV_PROXY=1 node node_modules/electron/install.js
npm start
```

The proxy option is needed in this managed cloud for Electron's native-fetch downloader. Keep TLS and packaged checksum verification enabled. Node must retain its configured CA trust. The server binds to loopback port 4310 by default; public hosting requires the existing HTTPS origin/private setup configuration in DEPLOYMENT.md. Live processes must restart after restoring an environment snapshot.

```
npm test
node test/ai-stop.test.ts
npm run build:app
HQ_PLAYWRIGHT_MODULE=file:///path/to/playwright/index.mjs HQ_CHROME_PATH=/usr/bin/chromium node scripts/qa/shared-office-browser-check.mjs
HQ_TEST_PACKAGED=1 HQ_PLAYWRIGHT_MODULE=file:///path/to/playwright/index.mjs HQ_CHROME_PATH=/usr/bin/chromium node scripts/qa/shared-office-browser-check.mjs
HQ_PLAYWRIGHT_MODULE=file:///path/to/playwright/index.mjs node scripts/qa/native-browser-tabs-check.mjs
```

Use an existing development Playwright installation; it is not a customer dependency. The browser checks create isolated synthetic accounts/databases and remove them afterward. The native check uses actual headless Electron and separately verifies an Electron desktop account inviting a Chromium website account into the same room with real message delivery. Linux validation does not certify the Windows installer, real audio hardware, public host persistence or a cross-network desktop-to-website visit. Those remain required before inviting the business friend expecting a verified deployed experience.
