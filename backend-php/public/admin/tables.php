<?php

require __DIR__ . '/includes/bootstrap.php';
admin_require_login();

use Burro\Db;

$db = Db::get();
$flash = '';
$flashType = 'ok';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = (string) ($_POST['action'] ?? '');
    $tableId = (int) ($_POST['table_id'] ?? 0);

    try {
        $stmt = $db->prepare("SELECT status FROM tables_ WHERE id = ?");
        $stmt->execute([$tableId]);
        $table = $stmt->fetch();
        if ($table === false) {
            throw new RuntimeException('Mesa no encontrada');
        }
        if ($table['status'] === 'playing') {
            throw new RuntimeException('No se puede tocar una mesa con una partida en curso');
        }

        if ($action === 'close_table') {
            $db->prepare("UPDATE tables_ SET status = 'finished' WHERE id = ?")->execute([$tableId]);
            $flash = 'Mesa cerrada.';
        } elseif ($action === 'delete_table') {
            // Sin ON DELETE CASCADE en el esquema: se borra manualmente en
            // orden hijo -> padre (mismo patrón usado antes para limpiar datos
            // de prueba de producción).
            $db->beginTransaction();
            $db->prepare(
                'DELETE tp FROM trick_plays tp
                 JOIN tricks t ON t.id = tp.trick_id
                 JOIN manos m ON m.id = t.mano_id
                 JOIN partidas p ON p.id = m.partida_id
                 WHERE p.table_id = ?'
            )->execute([$tableId]);
            $db->prepare(
                'DELETE t FROM tricks t
                 JOIN manos m ON m.id = t.mano_id
                 JOIN partidas p ON p.id = m.partida_id
                 WHERE p.table_id = ?'
            )->execute([$tableId]);
            $db->prepare(
                'DELETE mp FROM mano_players mp
                 JOIN manos m ON m.id = mp.mano_id
                 JOIN partidas p ON p.id = m.partida_id
                 WHERE p.table_id = ?'
            )->execute([$tableId]);
            $db->prepare(
                'DELETE m FROM manos m
                 JOIN partidas p ON p.id = m.partida_id
                 WHERE p.table_id = ?'
            )->execute([$tableId]);
            $db->prepare('DELETE FROM credit_transactions WHERE table_id = ?')->execute([$tableId]);
            $db->prepare('DELETE FROM table_players WHERE table_id = ?')->execute([$tableId]);
            $db->prepare('DELETE FROM partidas WHERE table_id = ?')->execute([$tableId]);
            $db->prepare('DELETE FROM tables_ WHERE id = ?')->execute([$tableId]);
            $db->commit();
            $flash = 'Mesa eliminada junto con todo su historial.';
        }
    } catch (\Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        $flash = $e->getMessage();
        $flashType = 'error';
    }
}

$tables = $db->query(
    "SELECT t.id, t.code, t.name, t.status, t.created_at, u.username AS creator,
            (SELECT COUNT(*) FROM table_players tp WHERE tp.table_id = t.id AND tp.status != 'left') AS player_count
     FROM tables_ t
     JOIN users u ON u.id = t.created_by
     ORDER BY t.id DESC"
)->fetchAll();

$pageTitle = 'Mesas - Admin Burro';
require __DIR__ . '/includes/layout_header.php';
?>
<h1>Mesas</h1>
<?php if ($flash): ?>
  <p class="<?= $flashType === 'ok' ? 'flash-ok' : 'flash-error' ?>"><?= h($flash) ?></p>
<?php endif; ?>

<table>
  <thead>
    <tr>
      <th>ID</th><th>Código</th><th>Nombre</th><th>Creador</th><th>Jugadores</th><th>Estado</th><th>Creada</th><th>Acciones</th>
    </tr>
  </thead>
  <tbody>
    <?php foreach ($tables as $t): ?>
      <tr>
        <td><?= (int) $t['id'] ?></td>
        <td><?= h($t['code']) ?></td>
        <td><?= h($t['name']) ?></td>
        <td><?= h($t['creator']) ?></td>
        <td><?= (int) $t['player_count'] ?></td>
        <td><?= h($t['status']) ?></td>
        <td><?= h($t['created_at']) ?></td>
        <td>
          <?php if ($t['status'] === 'playing'): ?>
            <em>partida en curso</em>
          <?php else: ?>
            <?php if ($t['status'] !== 'finished'): ?>
              <form class="inline" method="post" onsubmit="return confirm('¿Cerrar esta mesa? Ya no se podrá unir nadie ni iniciar otra partida.');">
                <input type="hidden" name="action" value="close_table">
                <input type="hidden" name="table_id" value="<?= (int) $t['id'] ?>">
                <button type="submit">Cerrar</button>
              </form>
            <?php endif; ?>
            <form class="inline" method="post" onsubmit="return confirm('¿Eliminar esta mesa y TODO su historial de forma permanente? Esta acción no se puede deshacer.');">
              <input type="hidden" name="action" value="delete_table">
              <input type="hidden" name="table_id" value="<?= (int) $t['id'] ?>">
              <button type="submit" class="danger">Eliminar</button>
            </form>
          <?php endif; ?>
        </td>
      </tr>
    <?php endforeach; ?>
  </tbody>
</table>
<?php require __DIR__ . '/includes/layout_footer.php'; ?>
