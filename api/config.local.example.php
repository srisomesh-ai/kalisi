<?php
/* Copy this file to config.local.php on the SERVER (File Manager) and fill in.
   Never commit config.local.php to Git. */
define('DB_PASS', 'your_database_password_here');

/* Admin panel credentials (optional overrides).
   Default user is 'someswara', default password 'Kalisi@Admin2026' — CHANGE the password.
   Generate a hash: echo hash('sha256','YourNewPassword'); */
// define('ADMIN_USER', 'someswara');
// define('ADMIN_PASS_HASH', 'paste_sha256_hash_here');

/* Push notifications (FCM HTTP v1):
   Place your Firebase service-account JSON at api/fcm-key.json (NOT in git).
   Download it from Firebase Console → Project Settings → Service accounts → Generate new private key.
   Without this file, the app still works; only push-when-closed is disabled. */
