<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/bootstrap.php';
require_login();

$action = str_input('action');
$userId = current_user_id();

function get_call(int $callId): ?array
{
    $stmt = db()->prepare('SELECT * FROM voice_call_sessions WHERE id = ? LIMIT 1');
    $stmt->execute([$callId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function require_call_participant(array $call, int $userId): void
{
    $caller = (int) $call['caller_id'];
    $callee = (int) $call['callee_id'];
    if ($userId !== $caller && $userId !== $callee) {
        json_error('Not a participant in this call.', 403);
    }
}

function group_call_peer_list(array $call): array
{
    $groupId = (int) ($call['group_id'] ?? 0);
    $callerId = (int) ($call['caller_id'] ?? 0);
    if ($groupId <= 0 || $callerId <= 0) {
        return [];
    }
    $started = (string) ($call['started_at'] ?? date('Y-m-d H:i:s'));
    $stmt = db()->prepare(
        "SELECT id, caller_id, callee_id, status
         FROM voice_call_sessions
         WHERE group_id = ?
           AND caller_id = ?
           AND status IN ('ringing', 'accepted')
           AND started_at BETWEEN DATE_SUB(?, INTERVAL 3 MINUTE) AND DATE_ADD(?, INTERVAL 3 MINUTE)
         ORDER BY id ASC"
    );
    $stmt->execute([$groupId, $callerId, $started, $started]);
    $ids = [];
    $connectedIds = [];
    foreach ($stmt->fetchAll() as $row) {
        $cid = (int) $row['caller_id'];
        $oid = (int) $row['callee_id'];
        if ($cid > 0) {
            $ids[$cid] = true;
        }
        if ($oid > 0) {
            $ids[$oid] = true;
            if (($row['status'] ?? '') === 'accepted') {
                $connectedIds[$cid] = true;
                $connectedIds[$oid] = true;
            }
        }
    }
    // Always include the call's own participants even if window query misses.
    $ids[(int) $call['caller_id']] = true;
    $ids[(int) $call['callee_id']] = true;
    if (($call['status'] ?? '') === 'accepted') {
        $connectedIds[(int) $call['caller_id']] = true;
        $connectedIds[(int) $call['callee_id']] = true;
    }

    $peers = [];
    foreach (array_keys($ids) as $uid) {
        $u = get_user_by_id((int) $uid);
        if (!$u) {
            continue;
        }
        $pub = public_user($u);
        $pub['connected'] = isset($connectedIds[(int) $uid]);
        $peers[] = $pub;
    }
    return $peers;
}

function format_call(array $call, int $viewerId, bool $includeSdp = false): array
{
    $peerId = (int) $call['caller_id'] === $viewerId ? (int) $call['callee_id'] : (int) $call['caller_id'];
    $peer = get_user_by_id($peerId);
    $groupId = isset($call['group_id']) ? (int) $call['group_id'] : 0;
    $data = [
        'id' => (int) $call['id'],
        'caller_id' => (int) $call['caller_id'],
        'callee_id' => (int) $call['callee_id'],
        'group_id' => $groupId > 0 ? $groupId : null,
        'call_type' => $call['call_type'],
        'status' => $call['status'],
        'is_caller' => (int) $call['caller_id'] === $viewerId,
        'peer' => $peer ? public_user($peer) : null,
        'started_at' => $call['started_at'],
        'answered_at' => $call['answered_at'],
        'ended_at' => $call['ended_at'],
    ];
    if ($groupId > 0) {
        $groupPeers = group_call_peer_list($call);
        $data['group_peers'] = $groupPeers;
        $data['group_peer_count'] = count($groupPeers);
        $connected = 0;
        foreach ($groupPeers as $gp) {
            if (!empty($gp['connected'])) {
                $connected++;
            }
        }
        $data['group_connected_count'] = max($connected, 1);
    }
    if ($includeSdp) {
        $offer = isset($call['sdp_offer']) ? normalize_sdp((string) $call['sdp_offer']) : '';
        $answer = isset($call['sdp_answer']) ? normalize_sdp((string) $call['sdp_answer']) : '';
        $data['sdp_offer'] = $offer !== '' ? $offer : null;
        $data['sdp_answer'] = $answer !== '' ? $answer : null;
    }
    return $data;
}

function end_other_active_calls(int $userId): void
{
    db()->prepare(
        "UPDATE voice_call_sessions SET status = 'ended', ended_at = NOW()
         WHERE status IN ('ringing','accepted') AND (caller_id = ? OR callee_id = ?)"
    )->execute([$userId, $userId]);
}

try {
    switch ($action) {
        case 'start':
            require_csrf();
            require_rate_limit('call_start', RATE_LIMIT_CALL, RATE_LIMIT_CALL_WINDOW);
            $calleeId = int_input('callee_id');
            $callType = str_input('call_type', 'voice');
            $sdpOffer = sdp_input('sdp_offer');

            if ($calleeId <= 0 || $calleeId === $userId) {
                json_error('Invalid callee.');
            }
            if (!in_array($callType, ['voice', 'video'], true)) {
                json_error('Invalid call type.');
            }
            if ($sdpOffer === '') {
                json_error('SDP offer is required.');
            }

            $callee = get_user_by_id($calleeId);
            if (!$callee || (int) $callee['is_disabled'] === 1) {
                json_error('User unavailable.', 404);
            }
            assert_not_blocked($userId, $calleeId, 'call');
            if (!users_are_friends($userId, $calleeId)) {
                json_error('You can only call friends.', 403);
            }

            $batch = (int) (input('batch') ?? 0) === 1;
            $groupId = int_input('group_id', 0);
            if ($groupId > 0) {
                $gm = db()->prepare(
                    'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1'
                );
                $gm->execute([$groupId, $userId]);
                if (!$gm->fetch()) {
                    json_error('You are not a member of this group.', 403);
                }
            }
            if ($batch) {
                // Multi-member group call: end only accepted calls for caller, keep other ringing legs.
                db()->prepare(
                    "UPDATE voice_call_sessions SET status = 'ended', ended_at = NOW()
                     WHERE status = 'accepted' AND (caller_id = ? OR callee_id = ?)"
                )->execute([$userId, $userId]);
            } else {
                end_other_active_calls($userId);
            }
            end_other_active_calls($calleeId);

            $ins = db()->prepare(
                'INSERT INTO voice_call_sessions (caller_id, callee_id, group_id, call_type, status, sdp_offer)
                 VALUES (?, ?, ?, ?, ?, ?)'
            );
            $ins->execute([
                $userId,
                $calleeId,
                $groupId > 0 ? $groupId : null,
                $callType,
                'ringing',
                $sdpOffer,
            ]);
            $callId = (int) db()->lastInsertId();

            $caller = get_user_by_id($userId);
            notify_user(
                $calleeId,
                'incoming_call',
                'Incoming ' . $callType . ' call',
                ($caller['username'] ?? 'Someone') . ' is calling you.',
                'chat.php?call=' . $callId,
                $callId
            );

            $call = get_call($callId);
            json_success('Call started.', format_call($call, $userId));
            break;

        case 'incoming':
            $stmt = db()->prepare(
                "SELECT * FROM voice_call_sessions
                 WHERE callee_id = ? AND status = 'ringing'
                 ORDER BY id DESC LIMIT 5"
            );
            $stmt->execute([$userId]);
            $calls = [];
            foreach ($stmt->fetchAll() as $row) {
                $calls[] = format_call($row, $userId, true);
            }
            json_success('OK', ['calls' => $calls]);
            break;

        case 'accept':
            require_csrf();
            $callId = int_input('call_id');
            $sdpAnswer = sdp_input('sdp_answer');
            if ($callId <= 0 || $sdpAnswer === '') {
                json_error('Invalid accept payload.');
            }
            $call = get_call($callId);
            if (!$call) {
                json_error('Call not found.', 404);
            }
            if ((int) $call['callee_id'] !== $userId) {
                json_error('Only the callee can accept.', 403);
            }
            if ($call['status'] !== 'ringing') {
                json_error('Call is no longer ringing.');
            }
            db()->prepare(
                "UPDATE voice_call_sessions SET status = 'accepted', sdp_answer = ?, answered_at = NOW() WHERE id = ?"
            )->execute([$sdpAnswer, $callId]);
            json_success('Call accepted.', format_call(get_call($callId), $userId));
            break;

        case 'reject':
            require_csrf();
            $callId = int_input('call_id');
            $call = get_call($callId);
            if (!$call) {
                json_error('Call not found.', 404);
            }
            require_call_participant($call, $userId);
            if ((int) $call['callee_id'] !== $userId) {
                json_error('Only the callee can reject.', 403);
            }
            if ($call['status'] !== 'ringing') {
                json_error('Call cannot be rejected.');
            }
            db()->prepare(
                "UPDATE voice_call_sessions SET status = 'rejected', ended_at = NOW() WHERE id = ?"
            )->execute([$callId]);
            db()->prepare(
                'INSERT INTO voice_call_signals (call_id, sender_id, signal_type, payload) VALUES (?, ?, ?, ?)'
            )->execute([$callId, $userId, 'hangup', '{"reason":"rejected"}']);
            $skipLog = (int) (input('skip_log') ?? 0) === 1;
            if (!$skipLog) {
                insert_call_log_message(get_call($callId) ?? $call, 'rejected');
            }
            json_success('Call rejected.');
            break;

        case 'cancel':
            require_csrf();
            $callId = int_input('call_id');
            $call = get_call($callId);
            if (!$call) {
                json_error('Call not found.', 404);
            }
            if ((int) $call['caller_id'] !== $userId) {
                json_error('Only the caller can cancel.', 403);
            }
            if ($call['status'] !== 'ringing') {
                json_error('Call cannot be cancelled.');
            }
            db()->prepare(
                "UPDATE voice_call_sessions SET status = 'cancelled', ended_at = NOW() WHERE id = ?"
            )->execute([$callId]);
            db()->prepare(
                'INSERT INTO voice_call_signals (call_id, sender_id, signal_type, payload) VALUES (?, ?, ?, ?)'
            )->execute([$callId, $userId, 'hangup', '{"reason":"cancelled"}']);
            $skipLog = (int) (input('skip_log') ?? 0) === 1;
            if (!$skipLog) {
                insert_call_log_message(get_call($callId) ?? $call, 'cancelled');
            }
            json_success('Call cancelled.');
            break;

        case 'end':
            require_csrf();
            $callId = int_input('call_id');
            $call = get_call($callId);
            if (!$call) {
                json_error('Call not found.', 404);
            }
            require_call_participant($call, $userId);
            if (!in_array($call['status'], ['ringing', 'accepted'], true)) {
                json_error('Call already ended.');
            }
            $status = $call['status'] === 'ringing' ? 'missed' : 'ended';
            if ((int) $call['caller_id'] === $userId && $call['status'] === 'ringing') {
                $status = 'cancelled';
            }
            db()->prepare(
                'UPDATE voice_call_sessions SET status = ?, ended_at = NOW() WHERE id = ?'
            )->execute([$status, $callId]);
            db()->prepare(
                'INSERT INTO voice_call_signals (call_id, sender_id, signal_type, payload) VALUES (?, ?, ?, ?)'
            )->execute([$callId, $userId, 'hangup', '{}']);
            $skipLog = (int) (input('skip_log') ?? 0) === 1;
            if (!$skipLog) {
                insert_call_log_message(
                    get_call($callId) ?? array_merge($call, ['ended_at' => date('Y-m-d H:i:s'), 'status' => $status]),
                    $status
                );
            }
            json_success('Call ended.');
            break;

        case 'signal':
            require_csrf();
            $callId = int_input('call_id');
            $signalType = str_input('signal_type');
            $payload = input('payload');

            if ($callId <= 0) {
                json_error('Invalid call.');
            }
            $call = get_call($callId);
            if (!$call) {
                json_error('Call not found.', 404);
            }
            require_call_participant($call, $userId);
            if (!in_array($call['status'], ['ringing', 'accepted'], true)) {
                json_error('Call is not active.');
            }
            if ($signalType !== 'ice') {
                json_error('Unsupported signal type.');
            }
            if (is_string($payload)) {
                $payloadJson = $payload;
            } else {
                $payloadJson = json_encode($payload ?? [], JSON_UNESCAPED_UNICODE);
            }
            if ($payloadJson === false || $payloadJson === '') {
                json_error('Invalid payload.');
            }
            db()->prepare(
                'INSERT INTO voice_call_signals (call_id, sender_id, signal_type, payload) VALUES (?, ?, ?, ?)'
            )->execute([$callId, $userId, 'ice', $payloadJson]);
            json_success('Signal sent.');
            break;

        case 'poll_signals':
            $callId = int_input('call_id');
            $afterId = int_input('after_id', 0);
            $call = get_call($callId);
            if (!$call) {
                json_error('Call not found.', 404);
            }
            require_call_participant($call, $userId);
            $stmt = db()->prepare(
                'SELECT id, sender_id, signal_type, payload, created_at
                 FROM voice_call_signals
                 WHERE call_id = ? AND id > ? AND sender_id != ?
                 ORDER BY id ASC LIMIT 100'
            );
            $stmt->execute([$callId, $afterId, $userId]);
            $signals = [];
            foreach ($stmt->fetchAll() as $row) {
                $signals[] = [
                    'id' => (int) $row['id'],
                    'sender_id' => (int) $row['sender_id'],
                    'signal_type' => $row['signal_type'],
                    'payload' => json_decode($row['payload'], true),
                    'created_at' => $row['created_at'],
                ];
            }
            json_success('OK', ['signals' => $signals, 'status' => $call['status']]);
            break;

        case 'status':
            $callId = int_input('call_id');
            $call = get_call($callId);
            if (!$call) {
                json_error('Call not found.', 404);
            }
            require_call_participant($call, $userId);
            json_success('OK', format_call($call, $userId, true));
            break;

        case 'log_group_call':
            require_csrf();
            $groupId = int_input('group_id');
            $callType = str_input('call_type', 'voice');
            $outcome = str_input('outcome', 'ended');
            $duration = int_input('duration', 0);
            $batchKey = str_input('batch_key');
            $participants = input('participants', []);
            if ($groupId <= 0) {
                json_error('Invalid group.');
            }
            $gm = db()->prepare(
                'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1'
            );
            $gm->execute([$groupId, $userId]);
            if (!$gm->fetch()) {
                json_error('You are not a member of this group.', 403);
            }
            if (!in_array($callType, ['voice', 'video'], true)) {
                $callType = 'voice';
            }
            if (!in_array($outcome, ['ended', 'rejected', 'cancelled', 'missed'], true)) {
                $outcome = 'ended';
            }
            if (!is_array($participants)) {
                $participants = [];
            }
            $participantIds = array_values(array_unique(array_map('intval', $participants)));
            if (!in_array($userId, $participantIds, true)) {
                $participantIds[] = $userId;
            }
            if ($batchKey === '') {
                $batchKey = 'g' . $groupId . '_' . time() . '_' . $userId;
            }
            insert_group_call_log_message(
                $groupId,
                [
                    'id' => 0,
                    'caller_id' => $userId,
                    'call_type' => $callType,
                    'duration' => max(0, $duration),
                    'answered_at' => $duration > 0 ? date('Y-m-d H:i:s', time() - $duration) : null,
                    'ended_at' => date('Y-m-d H:i:s'),
                ],
                $outcome,
                $participantIds,
                $batchKey
            );
            json_success('Group call logged.');
            break;

        default:
            json_error('Unknown action.', 404);
    }
} catch (Throwable $e) {
    app_log('calls.php: ' . $e->getMessage());
    json_error('An unexpected error occurred.', 500);
}
