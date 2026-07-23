<?php

namespace Burro\Controllers;

use Burro\Db;
use Burro\Http;
use PDO;

final class UserController
{
    private const MAX_RECHARGE = 1000;

    public function transactions(): never
    {
        $claims = Http::requireAuth();

        $stmt = Db::get()->prepare(
            'SELECT ct.id, ct.table_id, t.code AS table_code, ct.amount, ct.type, ct.reference_id, ct.created_at
             FROM credit_transactions ct
             LEFT JOIN tables_ t ON t.id = ct.table_id
             WHERE ct.user_id = ?
             ORDER BY ct.id DESC
             LIMIT 100'
        );
        $stmt->execute([$claims['sub']]);

        Http::json(['transactions' => $stmt->fetchAll()]);
    }

    public function recharge(): never
    {
        $claims = Http::requireAuth();
        $body = Http::body();
        $amount = (int) ($body['amount'] ?? 0);

        if ($amount < 1 || $amount > self::MAX_RECHARGE) {
            Http::error("El monto debe ser entre 1 y " . self::MAX_RECHARGE);
        }

        $db = Db::get();
        $userId = (int) $claims['sub'];

        $db->beginTransaction();
        try {
            $stmt = $db->prepare('UPDATE users SET credits = credits + ? WHERE id = ?');
            $stmt->execute([$amount, $userId]);

            $stmt = $db->prepare(
                "INSERT INTO credit_transactions (user_id, table_id, amount, type, reference_id) VALUES (?, NULL, ?, 'recharge', NULL)"
            );
            $stmt->execute([$userId, $amount]);

            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }

        $stmt = $db->prepare('SELECT credits FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $credits = (int) $stmt->fetch()['credits'];

        Http::json(['credits' => $credits]);
    }
}
