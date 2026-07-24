<?php

namespace Burro\Controllers;

use Burro\AdminSettings;
use Burro\Db;
use Burro\Http;
use Burro\Money;
use PDO;

/**
 * API interna, solo para el servicio Node (autenticada con una clave
 * compartida, no con JWT de usuario). Existe porque en producción la base de
 * datos de la mesa no es alcanzable desde fuera de la red de IONOS: Node ya
 * no habla con MySQL directo, le pide a PHP que lo haga.
 *
 * Espejo 1-a-1 de lo que antes era realtime-node/src/db/queries.js.
 */
final class InternalController
{
    private const SUIT_INITIAL = ['diamantes' => 'D', 'espadas' => 'E', 'corazones' => 'C', 'treboles' => 'T'];

    public function health(): never
    {
        Http::requireInternalAuth();
        Db::get()->query('SELECT 1');
        Http::json(['status' => 'ok', 'db' => 'ok']);
    }

    public function getSetting(string $key): never
    {
        Http::requireInternalAuth();

        $defaults = [
            'min_players_per_partida' => 3,
            'max_players_per_table' => 5,
            'max_card_exchange' => 5,
            'turn_timeout_seconds' => 30,
        ];

        $stmt = Db::get()->prepare('SELECT setting_value FROM admin_settings WHERE setting_key = ?');
        $stmt->execute([$key]);
        $row = $stmt->fetch();

        Http::json(['value' => $row !== false ? (int) $row['setting_value'] : ($defaults[$key] ?? 0)]);
    }

    public function seatOrder(string $tableId): never
    {
        Http::requireInternalAuth();

        $stmt = Db::get()->prepare(
            "SELECT tp.user_id, u.username, tp.table_balance FROM table_players tp
             JOIN users u ON u.id = tp.user_id
             WHERE tp.table_id = ? AND tp.status = 'active'
             ORDER BY tp.seat_order ASC"
        );
        $stmt->execute([$tableId]);

        Http::json(['players' => $stmt->fetchAll()]);
    }

    public function activePartida(string $tableId): never
    {
        Http::requireInternalAuth();

        $stmt = Db::get()->prepare(
            "SELECT * FROM partidas WHERE table_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute([$tableId]);
        $partida = $stmt->fetch();

        if ($partida !== false) {
            // Sin este cast, PDO devuelve las columnas DECIMAL como string y
            // Node/el frontend terminaban recibiendo "10.00" en vez de 10 —
            // eso hacía que `typeof fondo === 'number'` fallara y el fondo
            // dejara de mostrarse en la mesa durante la primera mano.
            $partida['ante_value'] = Money::of($partida['ante_value']);
            $partida['fondo_acumulado'] = Money::of($partida['fondo_acumulado']);
        }

        Http::json(['partida' => $partida !== false ? $partida : null]);
    }

    public function nextDealer(string $tableId): never
    {
        Http::requireInternalAuth();
        $db = Db::get();

        $stmt = $db->prepare(
            "SELECT user_id FROM table_players WHERE table_id = ? AND status = 'active' ORDER BY seat_order ASC"
        );
        $stmt->execute([$tableId]);
        $ids = array_map(static fn ($r) => (int) $r['user_id'], $stmt->fetchAll());

        $stmt = $db->prepare(
            'SELECT m.dealer_user_id FROM manos m
             JOIN partidas p ON p.id = m.partida_id
             WHERE p.table_id = ?
             ORDER BY m.id DESC LIMIT 1'
        );
        $stmt->execute([$tableId]);
        $lastMano = $stmt->fetch();

        if ($lastMano === false) {
            $stmt = $db->prepare('SELECT created_by FROM tables_ WHERE id = ?');
            $stmt->execute([$tableId]);
            Http::json(['dealer_user_id' => (int) $stmt->fetch()['created_by']]);
        }

        $lastIndex = array_search((int) $lastMano['dealer_user_id'], $ids, true);
        $dealerId = $lastIndex === false ? $ids[0] : $ids[($lastIndex + 1) % count($ids)];

        Http::json(['dealer_user_id' => $dealerId]);
    }

    public function manoCount(string $partidaId): never
    {
        Http::requireInternalAuth();

        $stmt = Db::get()->prepare('SELECT COUNT(*) AS n FROM manos WHERE partida_id = ?');
        $stmt->execute([$partidaId]);

        Http::json(['count' => (int) $stmt->fetch()['n']]);
    }

    public function createMano(): never
    {
        Http::requireInternalAuth();
        $body = Http::body();

        $stmt = Db::get()->prepare(
            "INSERT INTO manos (partida_id, mano_number, dealer_user_id, is_mandatory, trump_suit, fondo_before, status)
             VALUES (?, ?, ?, ?, ?, ?, 'dealing')"
        );
        $stmt->execute([
            $body['partida_id'],
            $body['mano_number'],
            $body['dealer_id'],
            $body['is_mandatory'] ? 1 : 0,
            $body['trump_suit'],
            $body['fondo_before'],
        ]);

        Http::json(['id' => (int) Db::get()->lastInsertId()]);
    }

    public function finalizeMano(string $manoId): never
    {
        Http::requireInternalAuth();
        $body = Http::body();

        $stmt = Db::get()->prepare("UPDATE manos SET status = 'finished', fondo_after = ? WHERE id = ?");
        $stmt->execute([$body['fondo_after'], $manoId]);

        Http::json(['ok' => true]);
    }

    public function insertManoPlayers(string $manoId): never
    {
        Http::requireInternalAuth();
        $body = Http::body();
        $db = Db::get();

        $stmt = $db->prepare(
            'INSERT INTO mano_players (mano_id, user_id, entered, exchanged_count, points, saved, renounced, paid_penalty, received_payout)
             VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)'
        );
        foreach ($body['entrants'] as $info) {
            $stmt->execute([
                $manoId,
                $info['userId'],
                $info['exchangedCount'] ?? 0,
                $info['points'],
                !empty($info['saved']) ? 1 : 0,
                !empty($info['renounced']) ? 1 : 0,
                $info['paidPenalty'] ?? 0,
                $info['receivedPayout'] ?? 0,
            ]);
        }

        Http::json(['ok' => true]);
    }

    public function insertTricks(string $manoId): never
    {
        Http::requireInternalAuth();
        $body = Http::body();
        $db = Db::get();

        foreach ($body['tricks'] as $trick) {
            $stmt = $db->prepare(
                'INSERT INTO tricks (mano_id, trick_number, leader_user_id, winner_user_id, led_suit)
                 VALUES (?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $manoId,
                $trick['trickNumber'],
                $trick['plays'][0]['userId'],
                $trick['winnerId'],
                $trick['ledSuit'],
            ]);
            $trickId = (int) $db->lastInsertId();

            foreach ($trick['plays'] as $i => $play) {
                $code = $play['card']['rank'] . (self::SUIT_INITIAL[$play['card']['suit']] ?? '?');
                $stmt = $db->prepare(
                    'INSERT INTO trick_plays (trick_id, user_id, card, play_order, is_achico)
                     VALUES (?, ?, ?, ?, ?)'
                );
                $stmt->execute([$trickId, $play['userId'], $code, $i + 1, !empty($play['isAchico']) ? 1 : 0]);
            }
        }

        Http::json(['ok' => true]);
    }

    public function applyManoPayments(string $manoId): never
    {
        Http::requireInternalAuth();
        $body = Http::body();
        $db = Db::get();
        $tableId = $body['table_id'];
        $partidaId = $body['partida_id'];
        $payments = $body['payments'];

        $db->beginTransaction();
        try {
            foreach ($payments['notSaved'] as $userId) {
                $db->prepare(
                    'UPDATE table_players SET table_balance = table_balance - ? WHERE table_id = ? AND user_id = ?'
                )->execute([$payments['paymentPerLoser'], $tableId, $userId]);
                $db->prepare(
                    "INSERT INTO credit_transactions (user_id, table_id, amount, type, reference_id) VALUES (?, ?, ?, 'penalty', ?)"
                )->execute([$userId, $tableId, -$payments['paymentPerLoser'], $manoId]);
            }

            foreach ($payments['payouts'] as $userId => $amount) {
                if ($amount <= 0) {
                    continue;
                }
                $db->prepare(
                    'UPDATE table_players SET table_balance = table_balance + ? WHERE table_id = ? AND user_id = ?'
                )->execute([$amount, $tableId, $userId]);
                $db->prepare(
                    "INSERT INTO credit_transactions (user_id, table_id, amount, type, reference_id) VALUES (?, ?, ?, 'payout', ?)"
                )->execute([$userId, $tableId, $amount, $manoId]);
            }

            $db->prepare('UPDATE partidas SET fondo_acumulado = ? WHERE id = ?')
                ->execute([$payments['newFondo'], $partidaId]);

            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }

        Http::json(['ok' => true]);
    }

    public function chargeAnte(string $partidaId): never
    {
        Http::requireInternalAuth();
        $body = Http::body();
        $db = Db::get();
        $tableId = $body['table_id'];
        $seatOrderIds = $body['seat_order_ids'];
        $anteValue = Money::of($body['ante_value']);

        $db->beginTransaction();
        try {
            foreach ($seatOrderIds as $userId) {
                $db->prepare(
                    'UPDATE table_players SET table_balance = table_balance - ? WHERE table_id = ? AND user_id = ?'
                )->execute([$anteValue, $tableId, $userId]);
                $db->prepare(
                    "INSERT INTO credit_transactions (user_id, table_id, amount, type, reference_id) VALUES (?, ?, ?, 'ante', ?)"
                )->execute([$userId, $tableId, -$anteValue, $partidaId]);
            }
            $db->prepare('UPDATE partidas SET fondo_acumulado = fondo_acumulado + ? WHERE id = ?')
                ->execute([Money::of($anteValue * count($seatOrderIds)), $partidaId]);

            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }

        Http::json(['ok' => true]);
    }

    public function tableBalances(string $tableId): never
    {
        Http::requireInternalAuth();

        $stmt = Db::get()->prepare(
            "SELECT user_id, table_balance FROM table_players WHERE table_id = ? AND status = 'active'"
        );
        $stmt->execute([$tableId]);

        $balances = [];
        foreach ($stmt->fetchAll() as $row) {
            $balances[$row['user_id']] = Money::of($row['table_balance']);
        }

        Http::json(['balances' => $balances]);
    }

    public function finalizePartida(string $partidaId): never
    {
        Http::requireInternalAuth();
        $body = Http::body();
        $db = Db::get();
        $tableId = $body['table_id'];
        $saved = array_values($body['saved']);
        $fondo = Money::of($body['fondo']);
        $share = 0.0;

        $db->beginTransaction();
        try {
            if (count($saved) > 0) {
                // División en centavos para no perder fichas por redondeo: el
                // residuo que no se divide exacto (a lo sumo unos centavos) se
                // le suma al primero, en vez de desaparecer al reiniciar el
                // fondo en 0 para la siguiente partida.
                $fondoCents = (int) round($fondo * 100);
                $shareCents = intdiv($fondoCents, count($saved));
                $remainderCents = $fondoCents - $shareCents * count($saved);
                $share = $shareCents / 100;

                foreach ($saved as $i => $userId) {
                    $cents = $shareCents + ($i === 0 ? $remainderCents : 0);
                    $payout = $cents / 100;
                    $db->prepare(
                        'UPDATE table_players SET table_balance = table_balance + ? WHERE table_id = ? AND user_id = ?'
                    )->execute([$payout, $tableId, $userId]);
                    $db->prepare(
                        "INSERT INTO credit_transactions (user_id, table_id, amount, type, reference_id) VALUES (?, ?, ?, 'payout', ?)"
                    )->execute([$userId, $tableId, $payout, $partidaId]);
                }
            }

            $db->prepare(
                "UPDATE partidas SET status = 'finished', ended_at = NOW(), fondo_acumulado = 0 WHERE id = ?"
            )->execute([$partidaId]);
            $db->prepare("UPDATE tables_ SET status = 'waiting' WHERE id = ?")->execute([$tableId]);

            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }

        Http::json(['ok' => true, 'payout_per_winner' => $share]);
    }

    /** Espejo de TableController::getTableState, para que Node avise al lobby sin tocar MySQL. */
    public function tableState(string $tableId): never
    {
        Http::requireInternalAuth();
        $db = Db::get();

        $stmt = $db->prepare('SELECT * FROM tables_ WHERE id = ?');
        $stmt->execute([$tableId]);
        $table = $stmt->fetch();
        if ($table === false) {
            Http::json(['state' => null]);
        }

        $stmt = $db->prepare(
            "SELECT tp.user_id, u.username, tp.seat_order, tp.table_balance, tp.status
             FROM table_players tp
             JOIN users u ON u.id = tp.user_id
             WHERE tp.table_id = ? AND tp.status != 'left'
             ORDER BY tp.seat_order ASC"
        );
        $stmt->execute([$tableId]);
        $players = array_map(static fn ($p) => [
            'user_id' => (int) $p['user_id'],
            'username' => $p['username'],
            'seat_order' => (int) $p['seat_order'],
            'table_balance' => Money::of($p['table_balance']),
            'status' => $p['status'],
        ], $stmt->fetchAll());

        Http::json(['state' => [
            'id' => (int) $table['id'],
            'code' => $table['code'],
            'name' => $table['name'],
            'ante_value' => Money::of($table['ante_value']),
            'status' => $table['status'],
            'created_by' => (int) $table['created_by'],
            'next_dealer_id' => $this->nextDealerId($db, (int) $table['id']),
            'min_players_per_partida' => AdminSettings::getInt('min_players_per_partida'),
            'players' => $players,
        ]]);
    }

    /**
     * Espejo de TableController::nextDealerId: a quién le toca repartir la
     * próxima mano 1 de esta mesa (creador si nunca se jugó una mano, o el
     * siguiente en la rotación de asientos después del último dealer).
     */
    private function nextDealerId(PDO $db, int $tableId): int
    {
        $stmt = $db->prepare(
            "SELECT user_id FROM table_players WHERE table_id = ? AND status = 'active' ORDER BY seat_order ASC"
        );
        $stmt->execute([$tableId]);
        $ids = array_map(static fn ($r) => (int) $r['user_id'], $stmt->fetchAll());

        $stmt = $db->prepare(
            'SELECT m.dealer_user_id FROM manos m
             JOIN partidas p ON p.id = m.partida_id
             WHERE p.table_id = ?
             ORDER BY m.id DESC LIMIT 1'
        );
        $stmt->execute([$tableId]);
        $lastMano = $stmt->fetch();

        if ($lastMano === false) {
            $stmt = $db->prepare('SELECT created_by FROM tables_ WHERE id = ?');
            $stmt->execute([$tableId]);
            return (int) $stmt->fetch()['created_by'];
        }

        if (count($ids) === 0) {
            return (int) $lastMano['dealer_user_id'];
        }

        $lastIndex = array_search((int) $lastMano['dealer_user_id'], $ids, true);
        return $lastIndex === false ? $ids[0] : $ids[($lastIndex + 1) % count($ids)];
    }
}
