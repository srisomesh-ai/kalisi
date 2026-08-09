<?php
/* Defaults — real credentials live in config.local.php on the server only.
   config.local.php is NOT in Git, so deployments never overwrite it. */
define('DB_HOST', 'localhost');
define('DB_NAME', 'u943205660_kalisi');
define('DB_USER', 'u943205660_kalisi');

$local = __DIR__ . '/config.local.php';
if (file_exists($local)) {
    require $local;           // defines DB_PASS (and can override the above)
}
if (!defined('DB_PASS')) {
    define('DB_PASS', '');    // no local config yet → connection will fail safely
}
