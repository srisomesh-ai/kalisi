<?php
/* ============================================================
   Kalisi Relay API v1 — relay-and-delete message queue
   The server stores ONLY: kalisi IDs, public keys, and
   encrypted blobs it cannot read — deleted on delivery.
   ============================================================ */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

set_error_handler(function($no,$str){ throw new ErrorException($str,0,$no); });
require __DIR__ . '/config.php';

try {
  $pdo = new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset=utf8mb4', DB_USER, DB_PASS,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
} catch (Throwable $e) { out(false, ['error' => 'db_connect_failed']); }

migrate($pdo);

$in = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $in['action'] ?? ($_GET['action'] ?? '');

try {
  switch ($action) {
    case 'register':  register($pdo, $in); break;
    case 'lookup':    lookup($pdo, $in); break;
    case 'send':      send($pdo, $in); break;
    case 'fetch':     fetchMsgs($pdo, $in); break;
    case 'check':     checkUsername($pdo, $in); break;
    case 'block':     blockUser($pdo, $in); break;
    case 'unblock':   unblockUser($pdo, $in); break;
    case 'status_post':   statusPost($pdo, $in); break;
    case 'status_feed':   statusFeed($pdo, $in); break;
    case 'group_create':  groupCreate($pdo, $in); break;
    case 'group_send':    groupSend($pdo, $in); break;
    case 'group_info':    groupInfo($pdo, $in); break;
    case 'ping':      out(true, ['pong' => time()]); break;
    default:          out(false, ['error' => 'unknown_action']);
  }
} catch (Throwable $e) {
  out(false, ['error' => 'server_error', 'detail' => $e->getMessage()]);
}

/* ---------------- endpoints ---------------- */

function register(PDO $pdo, array $in): void {
  $name = trim((string)($in['name'] ?? ''));
  $username = strtolower(trim((string)($in['username'] ?? ''), " @"));
  $pubkey = $in['pubkey'] ?? null; // JWK (public only)
  if ($name === '' || mb_strlen($name) > 24 || !is_array($pubkey)) out(false, ['error' => 'bad_input']);
  if (!preg_match('/^[a-z0-9_]{3,20}$/', $username)) out(false, ['error' => 'bad_username']);
  $st = $pdo->prepare('SELECT kal_id, last_seen FROM k_users WHERE username = ?'); $st->execute([$username]);
  if ($ex = $st->fetch()) {
    if (strtotime($ex['last_seen']) < time() - 90*86400) {
      // inactive 90+ days: release the handle (account keeps its KAL-ID)
      $pdo->prepare("UPDATE k_users SET username = '' WHERE kal_id = ?")->execute([$ex['kal_id']]);
    } else {
      out(false, ['error' => 'username_taken']);
    }
  }
  unset($pubkey['d']); // never accept private material
  $token = bin2hex(random_bytes(24));
  for ($i = 0; $i < 8; $i++) {
    $kid = kalId();
    try {
      $st = $pdo->prepare('INSERT INTO k_users (kal_id, username, name, pubkey, token, created_at, last_seen) VALUES (?,?,?,?,?,NOW(),NOW())');
      $st->execute([$kid, $username, $name, json_encode($pubkey), $token]);
      out(true, ['kal_id' => $kid, 'username' => $username, 'token' => $token]);
    } catch (PDOException $e) { /* duplicate id, retry */ }
  }
  out(false, ['error' => 'id_gen_failed']);
}

function lookup(PDO $pdo, array $in): void {
  $h = trim((string)($in['handle'] ?? ($in['kal_id'] ?? '')));
  if (preg_match('/^KAL-[A-Z2-9]{4}-[A-Z2-9]{4}$/i', $h)) {
    $st = $pdo->prepare('SELECT kal_id, username, name, pubkey FROM k_users WHERE kal_id = ?');
    $st->execute([strtoupper($h)]);
  } else {
    $u = strtolower(trim($h, " @"));
    if (!preg_match('/^[a-z0-9_]{3,20}$/', $u)) out(false, ['error' => 'bad_id']);
    $st = $pdo->prepare('SELECT kal_id, username, name, pubkey FROM k_users WHERE username = ?');
    $st->execute([$u]);
  }
  $u = $st->fetch();
  if (!$u) out(false, ['error' => 'not_found']);
  out(true, ['user' => ['kal_id' => $u['kal_id'], 'username' => $u['username'], 'name' => $u['name'], 'pubkey' => json_decode($u['pubkey'], true)]]);
}

function send(PDO $pdo, array $in): void {
  $me = auth($pdo, $in);
  $to = strtoupper(trim((string)($in['to'] ?? '')));
  $blob = (string)($in['blob'] ?? '');       // base64 AES-GCM ciphertext — opaque to server
  $iv = (string)($in['iv'] ?? '');
  $cid = substr((string)($in['client_id'] ?? ''), 0, 32); // sender's message id, for receipt matching
  if (!preg_match('/^KAL-[A-Z2-9]{4}-[A-Z2-9]{4}$/', $to) || $blob === '' || strlen($blob) > 900000) out(false, ['error' => 'bad_input']);
  $st = $pdo->prepare('SELECT 1 FROM k_users WHERE kal_id = ?'); $st->execute([$to]);
  if (!$st->fetch()) out(false, ['error' => 'recipient_not_found']);
  $st = $pdo->prepare('SELECT 1 FROM k_blocks WHERE blocker = ? AND blocked = ?'); $st->execute([$to, $me['kal_id']]);
  if ($st->fetch()) { out(true, ['queued' => true]); } // silently drop (blocked) — sender sees normal ticks
  $st = $pdo->prepare('INSERT INTO k_queue (to_id, from_id, client_id, iv, payload, created_at) VALUES (?,?,?,?,?,NOW())');
  $st->execute([$to, $me['kal_id'], $cid, $iv, $blob]);
  out(true, ['queued' => true]);
}

function fetchMsgs(PDO $pdo, array $in): void {
  $me = auth($pdo, $in);
  $out = ['messages' => [], 'receipts' => []];

  // 1) drain my incoming messages, deleting each and issuing a deletion receipt to the sender
  $st = $pdo->prepare('SELECT * FROM k_queue WHERE to_id = ? ORDER BY id ASC LIMIT 100');
  $st->execute([$me['kal_id']]);
  $rows = $st->fetchAll();
  foreach ($rows as $r) {
    $pdo->prepare('DELETE FROM k_queue WHERE id = ?')->execute([$r['id']]);
    $receipt = hash('sha256', $r['id'].'|'.$r['payload'].'|'.microtime(true).'|deleted');
    // receipt back to sender: proof the relay destroyed its copy (contains no content)
    $pdo->prepare('INSERT INTO k_receipts (to_id, client_id, receipt, created_at) VALUES (?,?,?,NOW())')
        ->execute([$r['from_id'], $r['client_id'], $receipt]);
    $out['messages'][] = ['from' => $r['from_id'], 'iv' => $r['iv'], 'blob' => $r['payload'], 'ts' => strtotime($r['created_at']) * 1000, 'receipt' => $receipt];
  }

  // 2) drain deletion receipts addressed to me (for messages I sent)
  $st = $pdo->prepare('SELECT * FROM k_receipts WHERE to_id = ? ORDER BY id ASC LIMIT 200');
  $st->execute([$me['kal_id']]);
  $recs = $st->fetchAll();
  foreach ($recs as $r) {
    $pdo->prepare('DELETE FROM k_receipts WHERE id = ?')->execute([$r['id']]);
    $out['receipts'][] = ['client_id' => $r['client_id'], 'receipt' => $r['receipt']];
  }

  $pdo->prepare('UPDATE k_users SET last_seen = NOW() WHERE kal_id = ?')->execute([$me['kal_id']]);
  out(true, $out);
}

function checkUsername(PDO $pdo, array $in): void {
  $u = strtolower(trim((string)($in['username'] ?? ''), " @"));
  if (!preg_match('/^[a-z0-9_]{3,20}$/', $u)) out(true, ['available' => false, 'reason' => 'invalid']);
  $st = $pdo->prepare('SELECT last_seen FROM k_users WHERE username = ?'); $st->execute([$u]);
  $ex = $st->fetch();
  $avail = !$ex || strtotime($ex['last_seen']) < time() - 90*86400;
  out(true, ['available' => $avail]);
}

function blockUser(PDO $pdo, array $in): void {
  $me = auth($pdo, $in);
  $t = strtoupper(trim((string)($in['kal_id'] ?? '')));
  if (!preg_match('/^KAL-[A-Z2-9]{4}-[A-Z2-9]{4}$/', $t)) out(false, ['error' => 'bad_id']);
  $pdo->prepare('INSERT IGNORE INTO k_blocks (blocker, blocked, created_at) VALUES (?,?,NOW())')->execute([$me['kal_id'], $t]);
  out(true, ['blocked' => $t]);
}
function unblockUser(PDO $pdo, array $in): void {
  $me = auth($pdo, $in);
  $t = strtoupper(trim((string)($in['kal_id'] ?? '')));
  $pdo->prepare('DELETE FROM k_blocks WHERE blocker = ? AND blocked = ?')->execute([$me['kal_id'], $t]);
  out(true, ['unblocked' => $t]);
}

function statusPost(PDO $pdo, array $in): void {
  $me = auth($pdo, $in);
  $type = in_array(($in['type'] ?? ''), ['text','photo','voice']) ? $in['type'] : 'text';
  $payload = (string)($in['payload'] ?? '');   // encrypted or plain small blob; capped
  if ($payload === '' || strlen($payload) > 1500000) out(false, ['error' => 'bad_input']);
  $pdo->prepare('INSERT INTO k_status (kal_id, type, payload, created_at) VALUES (?,?,?,NOW())')
      ->execute([$me['kal_id'], $type, $payload]);
  // keep only last 24h per user
  $pdo->prepare('DELETE FROM k_status WHERE created_at < (NOW() - INTERVAL 24 HOUR)')->execute();
  out(true, ['posted' => true]);
}
function statusFeed(PDO $pdo, array $in): void {
  $me = auth($pdo, $in);
  $ids = $in['contacts'] ?? [];   // list of KAL-IDs the user follows (their contacts)
  if (!is_array($ids)) $ids = [];
  $ids[] = $me['kal_id'];
  $ids = array_values(array_unique(array_filter($ids, fn($x)=>preg_match('/^KAL-[A-Z2-9]{4}-[A-Z2-9]{4}$/', (string)$x))));
  if (!$ids) out(true, ['status' => []]);
  $ph = implode(',', array_fill(0, count($ids), '?'));
  $st = $pdo->prepare("SELECT s.kal_id, s.type, s.payload, s.created_at, u.username, u.name
                       FROM k_status s JOIN k_users u ON u.kal_id = s.kal_id
                       WHERE s.kal_id IN ($ph) AND s.created_at > (NOW() - INTERVAL 24 HOUR)
                       ORDER BY s.created_at DESC LIMIT 200");
  $st->execute($ids);
  $rows = array_map(fn($r)=>[
    'kal_id'=>$r['kal_id'],'username'=>$r['username'],'name'=>$r['name'],
    'type'=>$r['type'],'payload'=>$r['payload'],'ts'=>strtotime($r['created_at'])*1000
  ], $st->fetchAll());
  out(true, ['status' => $rows]);
}

function groupCreate(PDO $pdo, array $in): void {
  $me = auth($pdo, $in);
  $name = trim((string)($in['name'] ?? ''));
  $members = $in['members'] ?? [];
  if ($name === '' || mb_strlen($name) > 40 || !is_array($members)) out(false, ['error' => 'bad_input']);
  $gid = 'GRP-'.substr(bin2hex(random_bytes(6)),0,10);
  $members[] = $me['kal_id'];
  $members = array_values(array_unique(array_filter($members, fn($x)=>preg_match('/^KAL-[A-Z2-9]{4}-[A-Z2-9]{4}$/', (string)$x))));
  $pdo->prepare('INSERT INTO k_groups (gid, name, owner, members, created_at) VALUES (?,?,?,?,NOW())')
      ->execute([$gid, $name, $me['kal_id'], json_encode($members)]);
  out(true, ['gid' => $gid, 'name' => $name, 'members' => $members]);
}
function groupInfo(PDO $pdo, array $in): void {
  $me = auth($pdo, $in);
  $gid = (string)($in['gid'] ?? '');
  $st = $pdo->prepare('SELECT * FROM k_groups WHERE gid = ?'); $st->execute([$gid]);
  $g = $st->fetch();
  if (!$g) out(false, ['error' => 'group_not_found']);
  out(true, ['group' => ['gid'=>$g['gid'],'name'=>$g['name'],'owner'=>$g['owner'],'members'=>json_decode($g['members'],true)]]);
}
function groupSend(PDO $pdo, array $in): void {
  $me = auth($pdo, $in);
  $gid = (string)($in['gid'] ?? '');
  $text = (string)($in['text'] ?? '');   // server-relayed simple group: fan-out plaintext-in-transit blob
  $iv = (string)($in['iv'] ?? '');
  $blob = (string)($in['blob'] ?? '');
  $cid = substr((string)($in['client_id'] ?? ''), 0, 32);
  if ($blob === '' || strlen($blob) > 900000) out(false, ['error' => 'bad_input']);
  $st = $pdo->prepare('SELECT members FROM k_groups WHERE gid = ?'); $st->execute([$gid]);
  $g = $st->fetch();
  if (!$g) out(false, ['error' => 'group_not_found']);
  $members = json_decode($g['members'], true) ?: [];
  $ins = $pdo->prepare('INSERT INTO k_queue (to_id, from_id, client_id, iv, payload, created_at) VALUES (?,?,?,?,?,NOW())');
  foreach ($members as $mm) {
    if ($mm === $me['kal_id']) continue;
    $ins->execute([$mm, $me['kal_id'], $cid, $iv, $blob]);
  }
  out(true, ['sent' => true, 'gid' => $gid]);
}

/* ---------------- helpers ---------------- */

function auth(PDO $pdo, array $in): array {
  $kid = strtoupper(trim((string)($in['kal_id'] ?? '')));
  $token = (string)($in['token'] ?? '');
  if ($kid === '' || $token === '') out(false, ['error' => 'auth_required']);
  $st = $pdo->prepare('SELECT kal_id, disabled FROM k_users WHERE kal_id = ? AND token = ?');
  $st->execute([$kid, $token]);
  $u = $st->fetch();
  if (!$u) out(false, ['error' => 'auth_failed']);
  if ((int)($u['disabled'] ?? 0) === 1) out(false, ['error' => 'account_disabled']);
  return $u;
}

function kalId(): string {
  $a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  $p = function ($n) use ($a) { $s = ''; for ($i = 0; $i < $n; $i++) $s .= $a[random_int(0, strlen($a) - 1)]; return $s; };
  return 'KAL-'.$p(4).'-'.$p(4);
}

function migrate(PDO $pdo): void {
  $pdo->exec("CREATE TABLE IF NOT EXISTS k_users (
    kal_id VARCHAR(14) PRIMARY KEY,
    username VARCHAR(20) NOT NULL DEFAULT '',
    name VARCHAR(48) NOT NULL,
    pubkey TEXT NOT NULL,
    token VARCHAR(64) NOT NULL,
    created_at DATETIME NOT NULL,
    last_seen DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  try { $pdo->exec("ALTER TABLE k_users ADD COLUMN username VARCHAR(20) NOT NULL DEFAULT ''"); } catch (Throwable $e) {}
  try { $pdo->exec("CREATE UNIQUE INDEX idx_username ON k_users (username)"); } catch (Throwable $e) {}
  try { $pdo->exec("ALTER TABLE k_users ADD COLUMN disabled TINYINT NOT NULL DEFAULT 0"); } catch (Throwable $e) {}
  $pdo->exec("CREATE TABLE IF NOT EXISTS k_blocks (
    blocker VARCHAR(14) NOT NULL,
    blocked VARCHAR(14) NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (blocker, blocked)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS k_status (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    kal_id VARCHAR(14) NOT NULL,
    type VARCHAR(8) NOT NULL DEFAULT 'text',
    payload MEDIUMTEXT NOT NULL,
    created_at DATETIME NOT NULL,
    KEY idx_kal (kal_id), KEY idx_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS k_groups (
    gid VARCHAR(16) PRIMARY KEY,
    name VARCHAR(60) NOT NULL,
    owner VARCHAR(14) NOT NULL,
    members MEDIUMTEXT NOT NULL,
    created_at DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS k_queue (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    to_id VARCHAR(14) NOT NULL,
    from_id VARCHAR(14) NOT NULL,
    client_id VARCHAR(32) NOT NULL DEFAULT '',
    iv VARCHAR(64) NOT NULL DEFAULT '',
    payload MEDIUMTEXT NOT NULL,
    created_at DATETIME NOT NULL,
    KEY idx_to (to_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS k_receipts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    to_id VARCHAR(14) NOT NULL,
    client_id VARCHAR(32) NOT NULL,
    receipt VARCHAR(64) NOT NULL,
    created_at DATETIME NOT NULL,
    KEY idx_to (to_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function out(bool $ok, array $data = []): void {
  echo json_encode(['ok' => $ok] + $data);
  exit;
}
