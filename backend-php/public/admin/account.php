<?php

require __DIR__ . '/includes/bootstrap.php';
$adminUser = admin_require_login();

use Burro\Db;

$db = Db::get();
$flash = '';
$flashType = 'ok';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $current = (string) ($_POST['current_password'] ?? '');
    $new = (string) ($_POST['new_password'] ?? '');
    $confirm = (string) ($_POST['confirm_password'] ?? '');

    $stmt = $db->prepare('SELECT password_hash FROM users WHERE id = ?');
    $stmt->execute([$adminUser['id']]);
    $row = $stmt->fetch();

    if ($row === false || !password_verify($current, $row['password_hash'])) {
        $flash = 'La contraseña actual no es correcta.';
        $flashType = 'error';
    } elseif (strlen($new) < 6) {
        $flash = 'La nueva contraseña debe tener al menos 6 caracteres.';
        $flashType = 'error';
    } elseif ($new !== $confirm) {
        $flash = 'La confirmación no coincide con la nueva contraseña.';
        $flashType = 'error';
    } else {
        $hash = password_hash($new, PASSWORD_BCRYPT);
        $db->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$hash, $adminUser['id']]);
        $flash = 'Contraseña actualizada correctamente.';
    }
}

$pageTitle = 'Mi cuenta - Admin Burro';
require __DIR__ . '/includes/layout_header.php';
?>
<h1>Mi cuenta</h1>
<?php if ($flash): ?>
  <p class="<?= $flashType === 'ok' ? 'flash-ok' : 'flash-error' ?>"><?= h($flash) ?></p>
<?php endif; ?>

<form method="post" class="card">
  <h2>Cambiar contraseña</h2>
  <label style="display:block; margin-bottom:1rem;">
    Contraseña actual<br>
    <input type="password" name="current_password" required>
  </label>
  <label style="display:block; margin-bottom:1rem;">
    Nueva contraseña<br>
    <input type="password" name="new_password" required minlength="6">
  </label>
  <label style="display:block; margin-bottom:1rem;">
    Confirmar nueva contraseña<br>
    <input type="password" name="confirm_password" required minlength="6">
  </label>
  <button type="submit" class="primary">Actualizar contraseña</button>
</form>
<?php require __DIR__ . '/includes/layout_footer.php'; ?>
