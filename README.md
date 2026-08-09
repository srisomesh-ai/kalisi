# GuptChat — Private messaging. No phone number.

**Web prototype (v0.1)** — Android-view webapp to test all features before the Flutter build.

## The pitch
- **No phone number, ever.** Identity = Gupt ID (e.g. `GUPT-7F3K-92MQ`). No OTP, no SIM, no email.
- **Your phone is the server.** Server relays encrypted messages, deletes its copy on delivery. Data lives only on the device.
- **Burn-on-read** messages (view once, then destroyed with animation).
- **Personas** — multiple unlinkable identities on one phone.
- **QR / one-time-link friending** — no searchable directory, zero spam.
- **Deletion receipts** — cryptographic proof the server deleted its copy (long-press a delivered message → Message info).

## Features in this prototype
Onboarding (name → Gupt ID), chat list + search, WhatsApp-style chat (ticks ✓/✓✓/read, typing indicator, day chips, reply/quote, photo sending, delete for me/everyone), burn-on-read, disappearing messages (incl. 30s demo timer), personas, my QR code, add by Gupt ID, expiring invite link, privacy dashboard, key fingerprint, export + wipe data.

Demo bots (GuptChat Team, Ravi, Priya + QR-scan friends) auto-reply so both sides of messaging can be tested. All data is in `localStorage` — nothing leaves the browser.

## Run
Open `index.html` — single file, no build, no backend. Deploy: connect this repo in Hostinger hPanel → Git.

## Roadmap
1. ✅ Web prototype (this)
2. Server: relay + delete queue (Matrix Synapse on VPS, or custom Node/WebSocket)
3. Flutter apps (Android first) with real E2E encryption (libsignal / matrix dart SDK)
4. Voice notes, calls, groups, screenshot detection (native only)
