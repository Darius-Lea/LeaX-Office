# Shared boardroom update — preview.48

Members and approved temporary guests can join one four-person room call from the same updated HTTPS host. The owner or co-owner joins first to open it. Others choose Join meeting room and explicitly grant their own microphone and optional camera. Use View boardroom for the actual remote video display. Each listener controls their device playback.

The host can request mute, allow a participant to unmute themselves, remove a person for the current meeting or end it for everyone. Shared positions and unique seats reflect actual scene presence, independently of audio/video connection. Screen sharing requires a separate browser prompt; only the chosen screen video is shared, while the microphone remains under its existing controls. No call recording or automatic transcript is added.

Reviewed decisions and action items are saved with revisions. A saved action is not dispatched business work. Owner/co-owner can invite a named AI adviser with an explicitly shared question and optionally the exact reviewed notes. It receives no private founder records or tools. Device reading requires listener permission. This adviser bridge needs a model on the installed local host; hosted/paired shared-meeting inference remains unconnected and reports setup required.

Central ICE settings now apply to guest calls, company phone and boardroom calls: HQ_STUN_URL (none disables), HQ_TURN_URL and HQ_TURN_SECRET, or HQ_TURN_USER/HQ_TURN_PASSWORD. Secrets are host configuration, not source code or chat. This update does not provision a production relay. All devices must use the same authoritative service; separate localhost installations do not federate.

Validation: first integrated update passed203 backend tests and production build. A later presence-client VM test exposed cross-realm Promise scheduling in its harness; it now waits for the event loop. New adviser code, final browser checks and release packaging are pending the validation workflow at this checkpoint. Synthetic loopback tests cannot establish physical-phone or external-network reliability. No production TURN or durable hosting was provisioned, and no owner data was used.


Final checkpoint:208/208 backend tests and production build passed in runs42329547097/42329964610. Four-browser QA timed out at office/guest page entry and remains FAILED/UNVERIFIED. Publishing requested by owner; actual media/device/network validation remains required.
