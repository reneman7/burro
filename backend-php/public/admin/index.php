<?php

require __DIR__ . '/includes/bootstrap.php';
admin_require_login();

use Burro\Db;
use Burro\Money;

$db = Db::get();
$totalUsers = (int) $db->query('SELECT COUNT(*) AS n FROM users')->fetch()['n'];
$totalTables = (int) $db->query('SELECT COUNT(*) AS n FROM tables_')->fetch()['n'];
$activePartidas = (int) $db->query("SELECT COUNT(*) AS n FROM partidas WHERE status = 'active'")->fetch()['n'];
$totalCreditsInCirculation = Money::of($db->query('SELECT COALESCE(SUM(credits), 0) AS n FROM users')->fetch()['n']);

$pageTitle = 'Panel - Admin Burro';
require __DIR__ . '/includes/layout_header.php';
?>
<h1>Panel de administrador</h1>
<div class="card">
  <p><strong>Usuarios registrados:</strong> <?= $totalUsers ?></p>
  <p><strong>Mesas creadas:</strong> <?= $totalTables ?></p>
  <p><strong>Partidas activas ahora mismo:</strong> <?= $activePartidas ?></p>
  <p><strong>Créditos en circulación (saldo global sumado):</strong> <?= number_format($totalCreditsInCirculation, 2) ?></p>
</div>
<p><a href="users.php">Gestionar usuarios</a> · <a href="settings.php">Configuración global</a></p>
<?php require __DIR__ . '/includes/layout_footer.php'; ?>
