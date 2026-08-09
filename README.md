# Kalisi — Private messenger. No phone number.

**Always together, always private.** Kalisi (కలిసి, "together") — a WhatsApp-class messenger where identity is a @username, never a phone number. End-to-end encrypted; chats live only on your phone. Domain: kalisi.app

## Project structure
```
index.html            Shell: links CSS + JS modules, holds all screen markup
css/
  app.css             Core app styles (onboarding, chat, sheets, privacy)
  landing-voice.css   Landing page + voice message styles
js/
  qrcode.js           QR generation library (vendored)
  net.js              Server API + E2E crypto (ECDH/AES-GCM) + polling + backup/restore + group receive
  voice.js            Voice message record & playback
  landing.js          Landing page routing + login (restore) entry
  settings.js         User settings page
  block.js            Block / unblock users
  status.js           Status / stories (text, photo, voice, 24h)
  groups.js           Group chats (server-relayed)
  app.js              Main app logic (chats, contacts, personas, burn, etc.)
admin/
  index.html          Separate admin panel (own login)
  api.php             Admin API: stats, list/enable/disable/delete users, list groups
api/
  index.php           Relay-and-delete backend (register/lookup/send/fetch/check/ping)
  config.php          Loads DB_PASS from config.local.php (git-ignored)
  config.local.example.php   Template for the server-only password file
```

## Features
No-phone @username identity · true E2E encryption · relay-and-delete with real deletion receipts · burn-on-read (text, photo, voice) · **voice messages** · personas · QR / add-by-username · disappearing messages · encrypted backup & restore (= login on new device) · 90-day username reclaim · impersonation protection · attractive landing page.

## Run
Open `index.html` via the web server (needs the css/ and js/ folders alongside). Deploy via Hostinger hPanel → Git.
Server password: create `api/config.local.php` on the server with `<?php define('DB_PASS','...');`

## Roadmap
1. ✅ Web prototype — modular, landing, voice
2. Flutter Android app (real E2E, phone storage, push)
3. Calls, groups, screenshot detection
