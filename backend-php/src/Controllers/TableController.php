<?php

namespace Burro\Controllers;

use Burro\AdminSettings;
use Burro\Db;
use Burro\Http;
use PDO;

final class TableController
{
    private const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para evitar confusión

    public function create(): never
    {
        $claims = Http::requireAuth();
        $body = Http::body();

        $name = trim((string) ($body['name'] ?? ''));
        $anteValue = (int) ($body['ante_value'] ?? 0);
        $buyIn = (int) ($body['buy_in'] ?? 0);

        if ($name === '') {
            $name = 'Mesa de ' . $claims['username'];
        }
        if ($anteValue < 1) {
            Http::error('La apuesta inicial debe ser al menos 1');
        }
        if ($buyIn < $anteValue) {
            Http::error('El monto de entrada debe ser al menos igual a la apuesta inicial');
        }

        $db = Db::get();
        $userId = (int) $claims['sub'];

        $db->beginTransaction();
        try {
            $this->lockUserCreditsOrFail($db, $userId, $buyIn);

            $code = $this->generateUniqueCode($db);

            $stmt = $db->prepare(
                'INSERT INTO tables_ (code, name, created_by, ante_value, status) VALUES (?, ?, ?, ?, \'waiting\')'
            );
            $stmt->execute([$code, $name, $userId, $anteValue]);
            $tableId = (int) $db->lastInsertId();

            $this->seatPlayerAndBuyIn($db, $tableId, $userId, 1, $buyIn);

            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }

        Http::json($this->getTableState($db, $tableId), 201);
    }

    public function join(): never
    {
        $claims = Http::requireAuth();
        $body = Http::body();
        $userId = (int) $claims['sub'];

        $code = strtoupper(trim((string) ($body['code'] ?? '')));
        $buyIn = (int) ($body['buy_in'] ?? 0);

        if ($code === '') {
            Http::error('Falta el código de la mesa');
        }

        $db = Db::get();

        $stmt = $db->prepare('SELECT * FROM tables_ WHERE code = ?');
        $stmt->execute([$code]);
        $table = $stmt->fetch();

        if ($table === false) {
            Http::error('No existe una mesa con ese código', 404);
        }
        if ($table['status'] === 'playing') {
            Http::error('Esa mesa ya tiene una partida en curso; espera a que termine', 409);
        }
        if ($buyIn < (int) $table['ante_value']) {
            Http::error('El monto de entrada debe ser al menos igual a la apuesta inicial de la mesa');
        }

        $stmt = $db->prepare(
            "SELECT COUNT(*) AS n, COALESCE(MAX(seat_order), 0) AS max_seat
             FROM table_players WHERE table_id = ? AND status = 'active'"
        );
        $stmt->execute([$table['id']]);
        $counts = $stmt->fetch();

        $maxPlayers = AdminSettings::getInt('max_players_per_table');
        if ((int) $counts['n'] >= $maxPlayers) {
            Http::error('La mesa ya está completa', 409);
        }

        $stmt = $db->prepare('SELECT id FROM table_players WHERE table_id = ? AND user_id = ?');
        $stmt->execute([$table['id'], $userId]);
        if ($stmt->fetch() !== false) {
            Http::error('Ya eres parte de esta mesa', 409);
        }

        $db->beginTransaction();
        try {
            $this->lockUserCreditsOrFail($db, $userId, $buyIn);
            $this->seatPlayerAndBuyIn($db, (int) $table['id'], $userId, (int) $counts['max_seat'] + 1, $buyIn);
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }

        Http::json($this->getTableState($db, (int) $table['id']));
    }

    /**
     * Agrega fichas a la mesa desde el saldo global del jugador (para un
     * miembro que ya está sentado, ej. cuando la partida se pausó por falta
     * de fondos). No cambia su asiento ni requiere que la mesa esté en espera.
     */
    public function topup(string $code): never
    {
        $claims = Http::requireAuth();
        $body = Http::body();
        $amount = (int) ($body['amount'] ?? 0);
        $userId = (int) $claims['sub'];

        if ($amount < 1) {
            Http::error('El monto debe ser mayor a 0');
        }

        $db = Db::get();
        $stmt = $db->prepare('SELECT id FROM tables_ WHERE code = ?');
        $stmt->execute([strtoupper($code)]);
        $table = $stmt->fetch();
        if ($table === false) {
            Http::error('No existe una mesa con ese código', 404);
        }

        $stmt = $db->prepare("SELECT id FROM table_players WHERE table_id = ? AND user_id = ? AND status = 'active'");
        $stmt->execute([$table['id'], $userId]);
        if ($stmt->fetch() === false) {
            Http::error('No eres parte activa de esta mesa', 403);
        }

        $db->beginTransaction();
        try {
            $this->lockUserCreditsOrFail($db, $userId, $amount);

            $stmt = $db->prepare('UPDATE table_players SET table_balance = table_balance + ? WHERE table_id = ? AND user_id = ?');
            $stmt->execute([$amount, $table['id'], $userId]);

            $stmt = $db->prepare('UPDATE users SET credits = credits - ? WHERE id = ?');
            $stmt->execute([$amount, $userId]);

            $stmt = $db->prepare(
                "INSERT INTO credit_transactions (user_id, table_id, amount, type, reference_id) VALUES (?, ?, ?, 'buyin', ?)"
            );
            $stmt->execute([$userId, $table['id'], -$amount, $table['id']]);

            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }

        Http::json($this->getTableState($db, (int) $table['id']));
    }

    public function show(string $code): never
    {
        Http::requireAuth();

        $db = Db::get();
        $stmt = $db->prepare('SELECT id FROM tables_ WHERE code = ?');
        $stmt->execute([strtoupper($code)]);
        $table = $stmt->fetch();

        if ($table === false) {
            Http::error('No existe una mesa con ese código', 404);
        }

        Http::json($this->getTableState($db, (int) $table['id']));
    }

    public function list(): never
    {
        $claims = Http::requireAuth();
        $db = Db::get();

        $stmt = $db->prepare(
            "SELECT t.id, t.code, t.name, t.ante_value, t.status, t.created_at
             FROM tables_ t
             JOIN table_players tp ON tp.table_id = t.id
             WHERE tp.user_id = ? AND tp.status != 'left'
             ORDER BY t.created_at DESC"
        );
        $stmt->execute([$claims['sub']]);

        Http::json(['tables' => $stmt->fetchAll()]);
    }

    public function updateAnte(string $code): never
    {
        $claims = Http::requireAuth();
        $body = Http::body();
        $anteValue = (int) ($body['ante_value'] ?? 0);

        if ($anteValue < 1) {
            Http::error('La apuesta inicial debe ser al menos 1');
        }

        $db = Db::get();
        $stmt = $db->prepare('SELECT * FROM tables_ WHERE code = ?');
        $stmt->execute([strtoupper($code)]);
        $table = $stmt->fetch();

        if ($table === false) {
            Http::error('No existe una mesa con ese código', 404);
        }
        if ((int) $table['created_by'] !== (int) $claims['sub']) {
            Http::error('Solo el creador de la mesa puede cambiar la apuesta inicial', 403);
        }
        if ($table['status'] === 'playing') {
            Http::error('No se puede cambiar la apuesta mientras hay una partida en curso', 409);
        }

        $stmt = $db->prepare('UPDATE tables_ SET ante_value = ? WHERE id = ?');
        $stmt->execute([$anteValue, $table['id']]);

        Http::json($this->getTableState($db, (int) $table['id']));
    }

    public function startPartida(string $code): never
    {
        $claims = Http::requireAuth();
        $body = Http::body();
        $mandatoryManos = (int) ($body['mandatory_manos'] ?? 0);

        if ($mandatoryManos < 1) {
            Http::error('El número de manos obligatorias debe ser al menos 1');
        }

        $db = Db::get();
        $stmt = $db->prepare('SELECT * FROM tables_ WHERE code = ?');
        $stmt->execute([strtoupper($code)]);
        $table = $stmt->fetch();

        if ($table === false) {
            Http::error('No existe una mesa con ese código', 404);
        }
        if ((int) $table['created_by'] !== (int) $claims['sub']) {
            // Nota: para partidas después de la primera, el dealer de la mano 1 (elegido
            // por rotación, calculado en la Fase 2) debería poder fijar este número, no
            // solo el creador. Se deja simplificado aquí porque la rotación de dealer aún
            // no existe sin el motor del juego.
            Http::error('Solo el creador de la mesa puede iniciar la partida', 403);
        }
        if ($table['status'] === 'playing') {
            Http::error('Ya hay una partida en curso en esta mesa', 409);
        }

        $stmt = $db->prepare(
            "SELECT COUNT(*) AS n FROM table_players WHERE table_id = ? AND status = 'active'"
        );
        $stmt->execute([$table['id']]);
        $activeCount = (int) $stmt->fetch()['n'];

        $minPlayers = AdminSettings::getInt('min_players_per_partida');
        if ($activeCount < $minPlayers) {
            Http::error("Se necesitan al menos {$minPlayers} jugadores para iniciar una partida", 409);
        }

        $db->beginTransaction();
        try {
            $stmt = $db->prepare(
                'INSERT INTO partidas (table_id, ante_value, mandatory_manos, fondo_acumulado, status)
                 VALUES (?, ?, ?, 0, \'active\')'
            );
            $stmt->execute([$table['id'], $table['ante_value'], $mandatoryManos]);
            $partidaId = (int) $db->lastInsertId();

            $stmt = $db->prepare("UPDATE tables_ SET status = 'playing' WHERE id = ?");
            $stmt->execute([$table['id']]);

            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }

        // El reparto de cartas y el motor de la mano 1 los maneja el servicio de
        // tiempo real (Fase 2/3), que detectará esta partida 'active' sin manos aún.
        Http::json(['partida_id' => $partidaId] + $this->getTableState($db, (int) $table['id']), 201);
    }

    // -------------------------------------------------------------------
    // Helpers internos
    // -------------------------------------------------------------------

    /**
     * Bloquea la fila del usuario (SELECT ... FOR UPDATE, dentro de una transacción
     * ya abierta) y valida que tenga saldo suficiente, para evitar condiciones de
     * carrera si el mismo usuario dispara dos compras simultáneas.
     */
    private function lockUserCreditsOrFail(PDO $db, int $userId, int $required): void
    {
        $stmt = $db->prepare('SELECT credits FROM users WHERE id = ? FOR UPDATE');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();

        if ($row === false) {
            $db->rollBack();
            Http::error('Usuario no encontrado', 404);
        }
        if ((int) $row['credits'] < $required) {
            $db->rollBack();
            Http::error('No tienes suficientes créditos para ese monto de entrada', 400);
        }
    }

    private function seatPlayerAndBuyIn(PDO $db, int $tableId, int $userId, int $seatOrder, int $buyIn): void
    {
        $stmt = $db->prepare(
            "INSERT INTO table_players (table_id, user_id, seat_order, table_balance, status)
             VALUES (?, ?, ?, ?, 'active')"
        );
        $stmt->execute([$tableId, $userId, $seatOrder, $buyIn]);

        $stmt = $db->prepare('UPDATE users SET credits = credits - ? WHERE id = ?');
        $stmt->execute([$buyIn, $userId]);

        $stmt = $db->prepare(
            "INSERT INTO credit_transactions (user_id, table_id, amount, type, reference_id)
             VALUES (?, ?, ?, 'buyin', ?)"
        );
        $stmt->execute([$userId, $tableId, -$buyIn, $tableId]);
    }

    private function generateUniqueCode(PDO $db): string
    {
        do {
            $code = '';
            for ($i = 0; $i < 6; $i++) {
                $code .= self::CODE_ALPHABET[random_int(0, strlen(self::CODE_ALPHABET) - 1)];
            }
            $stmt = $db->prepare('SELECT id FROM tables_ WHERE code = ?');
            $stmt->execute([$code]);
        } while ($stmt->fetch() !== false);

        return $code;
    }

    /** @return array<string,mixed> */
    private function getTableState(PDO $db, int $tableId): array
    {
        $stmt = $db->prepare('SELECT * FROM tables_ WHERE id = ?');
        $stmt->execute([$tableId]);
        $table = $stmt->fetch();

        $stmt = $db->prepare(
            "SELECT tp.user_id, u.username, tp.seat_order, tp.table_balance, tp.status
             FROM table_players tp
             JOIN users u ON u.id = tp.user_id
             WHERE tp.table_id = ? AND tp.status != 'left'
             ORDER BY tp.seat_order ASC"
        );
        $stmt->execute([$tableId]);
        $players = $stmt->fetchAll();

        return [
            'id' => (int) $table['id'],
            'code' => $table['code'],
            'name' => $table['name'],
            'ante_value' => (int) $table['ante_value'],
            'status' => $table['status'],
            'created_by' => (int) $table['created_by'],
            'players' => array_map(static fn ($p) => [
                'user_id' => (int) $p['user_id'],
                'username' => $p['username'],
                'seat_order' => (int) $p['seat_order'],
                'table_balance' => (int) $p['table_balance'],
                'status' => $p['status'],
            ], $players),
        ];
    }
}
