<?php

require __DIR__ . '/includes/bootstrap.php';
admin_require_login();

use Burro\Db;

$db = Db::get();
$flash = '';

$labels = [
    'min_players_per_partida' => 'Mínimo de jugadores para iniciar una partida',
    'max_players_per_table' => 'Máximo de jugadores por mesa',
    'max_card_exchange' => 'Máximo de cartas a intercambiar por mano',
    'turn_timeout_seconds' => 'Segundos de espera por turno (timeout)',
];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    foreach ($labels as $key => $label) {
        if (!isset($_POST[$key])) {
            continue;
        }
        $value = (int) $_POST[$key];
        if ($value < 1) {
            continue;
        }
        $stmt = $db->prepare(
            'INSERT INTO admin_settings (setting_key, setting_value) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)'
        );
        $stmt->execute([$key, (string) $value]);
    }
    $flash = 'Configuración actualizada.';
}

$rows = $db->query('SELECT setting_key, setting_value FROM admin_settings')->fetchAll();
$settings = array_column($rows, 'setting_value', 'setting_key');

$pageTitle = 'Configuración - Admin Burro';
require __DIR__ . '/includes/layout_header.php';
?>
<h1>Configuración global</h1>
<?php if ($flash): ?><p class="flash-ok"><?= h($flash) ?></p><?php endif; ?>

<form method="post" class="card">
  <?php foreach ($labels as $key => $label): ?>
    <label style="display:block; margin-bottom:1rem;">
      <?= h($label) ?><br>
      <input type="number" min="1" name="<?= h($key) ?>" value="<?= h($settings[$key] ?? '') ?>" required>
    </label>
  <?php endforeach; ?>
  <button type="submit" class="primary">Guardar</button>
</form>

<p><em>Nota: estos valores aplican a mesas y manos nuevas; no afectan una partida que ya esté en curso.</em></p>
<?php require __DIR__ . '/includes/layout_footer.php'; ?>
