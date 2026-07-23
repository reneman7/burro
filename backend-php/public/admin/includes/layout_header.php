<?php
/** @var string $pageTitle */
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title><?= h($pageTitle ?? 'Admin Burro') ?></title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #f5f6f8; color: #1c1c1c; }
  header { background: #1c1c2e; color: #fff; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
  header a { color: #fff; text-decoration: none; margin-right: 1.25rem; font-weight: 600; }
  header a:hover { text-decoration: underline; }
  main { max-width: 960px; margin: 2rem auto; padding: 0 1rem; }
  table { width: 100%; border-collapse: collapse; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  th, td { text-align: left; padding: 0.6rem 0.9rem; border-bottom: 1px solid #e5e5e5; }
  th { background: #eceef2; }
  .card { background: #fff; padding: 1.25rem 1.5rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 1.5rem; }
  form.inline { display: inline-flex; gap: 0.4rem; align-items: center; }
  input, select, button { font-size: 0.95rem; padding: 0.35rem 0.5rem; }
  button { cursor: pointer; border-radius: 4px; border: 1px solid #ccc; background: #f0f0f0; }
  button.primary { background: #2b8aef; color: #fff; border-color: #2b8aef; }
  button.danger { background: #e5484d; color: #fff; border-color: #e5484d; }
  .flash-ok { color: #1a7f37; font-weight: 600; }
  .flash-error { color: #cf222e; font-weight: 600; }
  .login-box { max-width: 320px; margin: 4rem auto; }
  .login-box label { display: block; margin-bottom: 0.75rem; }
  .login-box input { width: 100%; box-sizing: border-box; }
</style>
</head>
<body>
<?php if (admin_current_user()): ?>
<header>
  <div>
    <a href="index.php">Panel</a>
    <a href="users.php">Usuarios</a>
    <a href="settings.php">Configuración</a>
  </div>
  <div>
    <?= h(admin_current_user()['username']) ?> · <a href="account.php">Mi cuenta</a> · <a href="logout.php">Salir</a>
  </div>
</header>
<?php endif; ?>
<main>
