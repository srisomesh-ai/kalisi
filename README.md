# Kalisi — Private messenger. No phone number.

**Always together, always private.** Kalisi (Telugu: కలిసి, "together") is a WhatsApp-class messenger where identity is a Kalisi ID (`KAL-XXXX-XXXX`) — no phone number, no OTP, no SIM, ever. Domain: kalisi.app

**Web prototype (v0.1)** — Android-view webapp to test all features before the Flutter build.

## Why Kalisi
- **No phone number, ever.** Your Kalisi ID is all anyone sees.
- **Your phone is the server.** The relay deletes its copy the moment a message is delivered — with a cryptographic deletion receipt as proof.
- **Burn-on-read** messages (view once, then destroyed).
- **Personas** — multiple unlinkable identities on one phone (family / business / strangers).
- **QR & one-time-link friending** — no searchable directory, zero spam.

## In this prototype
Onboarding (name → Kalisi ID), chat list + search, WhatsApp-style chat (ticks, typing, day chips, reply/quote, photos, delete for me/everyone), burn-on-read, disappearing messages (incl. 30s demo), personas, QR code, add by ID, expiring invite links, privacy dashboard, key fingerprint, export/wipe. Demo bots auto-reply for two-sided testing. All data in localStorage — nothing leaves the browser.

## Run
Open `index.html` — single file, no build. Deploy via Hostinger hPanel → Git.

## Roadmap
1. ✅ Web prototype
2. Server: relay + delete queue (Matrix Synapse on VPS or Node/WebSocket)
3. Flutter Android app, real E2E encryption (libsignal / matrix SDK)
4. Voice notes, calls, groups, screenshot detection
5. Play Store: "Kalisi – Private Messenger"
