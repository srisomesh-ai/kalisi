<?php
/* Push diagnostics.
 *
 * Open this in a browser to see, in plain terms, whether push can work:
 *   https://kalisi.app/api/pushcheck.php
 *
 * It reports configuration only. It never prints the key, and it can't read
 * any message — it just answers "is push set up, and are devices registered".
 */
header('Content-Type: text/plain; charset=utf-8');

echo "KALISI PUSH CHECK\n";
echo "=================\n\n";

// 1. the service account file
$keyPath = __DIR__ . '/fcm-key.json';
if (!file_exists($keyPath)) {
    echo "[FAIL] api/fcm-key.json is NOT there.\n";
    echo "       Upload the Firebase service-account JSON to the api folder,\n";
    echo "       named exactly fcm-key.json. Push cannot work without it.\n";
    exit;
}
if (!is_readable($keyPath)) {
    echo "[FAIL] api/fcm-key.json exists but PHP cannot read it.\n";
    echo "       Set its permissions to 644.\n";
    exit;
}
$sa = json_decode((string)file_get_contents($keyPath), true);
if (!$sa || empty($sa['client_email']) || empty($sa['private_key'])) {
    echo "[FAIL] api/fcm-key.json is not a valid service-account file.\n";
    echo "       Re-download it from Firebase Console > Project settings >\n";
    echo "       Service accounts > Generate new private key.\n";
    exit;
}
echo "[ok]   Key file found.\n";
echo "       project: " . ($sa['project_id'] ?? '?') . "\n";
echo "       account: " . substr((string)($sa['client_email'] ?? ''), 0, 28) . "...\n\n";

// 2. can we get a Google access token
require_once __DIR__ . '/config.php';
$token = null;
{
    // signed here rather than reusing the app's helper, so the failure
    // reason can be shown
    $now = time();
    $claim = [
        'iss'   => $sa['client_email'],
        'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
        'aud'   => 'https://oauth2.googleapis.com/token',
        'iat'   => $now,
        'exp'   => $now + 3600,
    ];
    $b64 = fn($d) => rtrim(strtr(base64_encode($d), '+/', '-_'), '=');
    $jwt = $b64(json_encode(['alg' => 'RS256', 'typ' => 'JWT'])) . '.' . $b64(json_encode($claim));
    $sig = '';
    $ok  = @openssl_sign($jwt, $sig, $sa['private_key'], 'sha256WithRSAEncryption');
    if (!$ok) {
        echo "[FAIL] Could not sign with the private key.\n";
        echo "       The key may have been reformatted on upload — the \\n\n";
        echo "       sequences inside private_key must stay intact.\n";
        exit;
    }
    $jwt .= '.' . $b64($sig);

    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8,
        CURLOPT_POSTFIELDS => http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion'  => $jwt,
        ]),
    ]);
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);

    if ($err) {
        echo "[FAIL] Cannot reach Google from this server: $err\n";
        echo "       Hostinger may be blocking outbound HTTPS.\n";
        exit;
    }
    $j = json_decode((string)$res, true);
    $token = $j['access_token'] ?? null;
    if (!$token) {
        echo "[FAIL] Google refused the key (HTTP $code).\n";
        echo "       " . substr((string)$res, 0, 240) . "\n";
        echo "       Usually means the key was revoked, or the Firebase\n";
        echo "       Cloud Messaging API is not enabled for the project.\n";
        exit;
    }
}
echo "[ok]   Google accepted the key — push can be sent.\n\n";


// 3. registered devices
try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    $n = (int)$pdo->query("SELECT COUNT(*) FROM k_fcm")->fetchColumn();
    if ($n === 0) {
        echo "[FAIL] No devices are registered.\n";
        echo "       Open the app on a phone, allow notifications when asked,\n";
        echo "       then reload this page. If it stays 0, the app is not\n";
        echo "       reaching the server or the notification permission was\n";
        echo "       denied.\n";
    } else {
        echo "[ok]   $n device(s) registered.\n";
        $rows = $pdo->query("SELECT kal_id, updated_at FROM k_fcm ORDER BY updated_at DESC LIMIT 10")->fetchAll();
        foreach ($rows as $r) {
            echo "       " . $r['kal_id'] . "  last seen " . $r['updated_at'] . "\n";
        }
    }
} catch (Throwable $e) {
    echo "[FAIL] Database problem: " . $e->getMessage() . "\n";
}

echo "\nIf every line above says ok, push is configured correctly and any\n";
echo "remaining problem is on the phone — usually battery optimisation\n";
echo "killing the app, or notifications turned off for Kalisi.\n";
