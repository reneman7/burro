USE burro;

INSERT INTO admin_settings (setting_key, setting_value) VALUES
  ('min_players_per_partida', '3'),
  ('max_players_per_table', '5'),
  ('max_card_exchange', '5'),
  ('turn_timeout_seconds', '30')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- Usuario administrador por defecto (username: admin / password: admin123)
-- Cambiar la contraseña apenas se pueda entrar al panel admin.
INSERT INTO users (username, password_hash, credits, role)
VALUES ('admin', '$2y$10$nJ3XYbzeApKE9typXtXVB.mQgOhwb.tXzLafTkIeb3y5EC/4CNOkG', 0, 'admin')
ON DUPLICATE KEY UPDATE role = 'admin';
