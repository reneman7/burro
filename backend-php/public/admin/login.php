<?php

require __DIR__ . '/includes/bootstrap.php';

if (admin_current_user() !== null) {
    header('Location: index.php');
    exit;
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim((string) ($_POST['username'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');

    if (admin_login($username, $password)) {
        header('Location: index.php');
        exit;
    }
    $error = 'Usuario, contraseña incorrectos, o la cuenta no tiene rol de administrador.';
}

$pageTitle = 'Ingresar - Admin Burro';
require __DIR__ . '/includes/layout_header.php';
?>
<div class="login-box card">
  <h1>Panel de administrador</h1>
  <?php if ($error): ?><p class="flash-error"><?= h($error) ?></p><?php endif; ?>
  <form method="post">
    <label>Usuario
      <input type="text" name="username" required autofocus>
    </label>
    <label>Contraseña
      <input type="password" name="password" required>
    </label>
    <button type="submit" class="primary">Ingresar</button>
  </form>
</div>
<?php require __DIR__ . '/includes/layout_footer.php'; ?>
