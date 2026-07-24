<?php

require __DIR__ . '/includes/bootstrap.php';
$adminUser = admin_require_login();

use Burro\Db;
use Burro\Money;

$db = Db::get();
$flash = '';
$flashType = 'ok';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = (string) ($_POST['action'] ?? '');
    $userId = (int) ($_POST['user_id'] ?? 0);

    try {
        if ($action === 'adjust_credits') {
            $delta = Money::of($_POST['delta'] ?? 0);
            if ($delta === 0.0) {
                throw new RuntimeException('El ajuste no puede ser 0');
            }

            $db->beginTransaction();
            $stmt = $db->prepare('SELECT credits FROM users WHERE id = ? FOR UPDATE');
            $stmt->execute([$userId]);
            $row = $stmt->fetch();
            if ($row === false) {
                throw new RuntimeException('Usuario no encontrado');
            }
            if (Money::of($row['credits']) + $delta < 0) {
                throw new RuntimeException('El ajuste dejaría el saldo en negativo');
            }

            $db->prepare('UPDATE users SET credits = credits + ? WHERE id = ?')->execute([$delta, $userId]);
            $db->prepare(
                "INSERT INTO credit_transactions (user_id, table_id, amount, type, reference_id) VALUES (?, NULL, ?, 'admin_adjust', ?)"
            )->execute([$userId, $delta, $adminUser['id']]);
            $db->commit();

            $flash = "Saldo ajustado ($delta) correctamente.";
        } elseif ($action === 'toggle_active') {
            $db->prepare('UPDATE users SET is_active = 1 - is_active WHERE id = ?')->execute([$userId]);
            $flash = 'Estado de la cuenta actualizado.';
        } elseif ($action === 'toggle_role') {
            $stmt = $db->prepare('SELECT role FROM users WHERE id = ?');
            $stmt->execute([$userId]);
            $current = $stmt->fetch();
            if ($current !== false) {
                $newRole = $current['role'] === 'admin' ? 'player' : 'admin';
                $db->prepare('UPDATE users SET role = ? WHERE id = ?')->execute([$newRole, $userId]);
                $flash = "Rol actualizado a {$newRole}.";
            }
        }
    } catch (\Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        $flash = $e->getMessage();
        $flashType = 'error';
    }
}

$users = $db->query('SELECT id, username, credits, role, is_active, created_at FROM users ORDER BY id ASC')->fetchAll();

$pageTitle = 'Usuarios - Admin Burro';
require __DIR__ . '/includes/layout_header.php';
?>
<h1>Usuarios</h1>
<?php if ($flash): ?>
  <p class="<?= $flashType === 'ok' ? 'flash-ok' : 'flash-error' ?>"><?= h($flash) ?></p>
<?php endif; ?>

<table>
  <thead>
    <tr>
      <th>ID</th><th>Usuario</th><th>Créditos</th><th>Rol</th><th>Estado</th><th>Creado</th><th>Acciones</th>
    </tr>
  </thead>
  <tbody>
    <?php foreach ($users as $u): ?>
      <tr>
        <td><?= (int) $u['id'] ?></td>
        <td><?= h($u['username']) ?></td>
        <td><?= number_format((float) $u['credits'], 2) ?></td>
        <td><?= h($u['role']) ?></td>
        <td><?= ((int) $u['is_active']) === 1 ? 'Activo' : 'Bloqueado' ?></td>
        <td><?= h($u['created_at']) ?></td>
        <td>
          <form class="inline" method="post">
            <input type="hidden" name="action" value="adjust_credits">
            <input type="hidden" name="user_id" value="<?= (int) $u['id'] ?>">
            <input type="number" step="0.01" name="delta" placeholder="+/-" style="width:80px" required>
            <button type="submit">Ajustar</button>
          </form>
          <form class="inline" method="post" onsubmit="return confirm('¿Confirmas el cambio de estado?');">
            <input type="hidden" name="action" value="toggle_active">
            <input type="hidden" name="user_id" value="<?= (int) $u['id'] ?>">
            <button type="submit" class="<?= ((int) $u['is_active']) === 1 ? 'danger' : 'primary' ?>">
              <?= ((int) $u['is_active']) === 1 ? 'Bloquear' : 'Desbloquear' ?>
            </button>
          </form>
          <form class="inline" method="post" onsubmit="return confirm('¿Confirmas el cambio de rol?');">
            <input type="hidden" name="action" value="toggle_role">
            <input type="hidden" name="user_id" value="<?= (int) $u['id'] ?>">
            <button type="submit"><?= $u['role'] === 'admin' ? 'Quitar admin' : 'Hacer admin' ?></button>
          </form>
        </td>
      </tr>
    <?php endforeach; ?>
  </tbody>
</table>
<?php require __DIR__ . '/includes/layout_footer.php'; ?>
