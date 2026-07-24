-- Convierte todas las columnas de créditos/fichas de INT a DECIMAL(10,2), para
-- que los pagos y repartos puedan dar cifras con decimales en vez de perderse
-- por redondeo entero. MODIFY COLUMN conserva los datos existentes (10 -> 10.00).
-- Segura de correr más de una vez (MODIFY COLUMN a DECIMAL sobre una columna
-- que ya es DECIMAL simplemente no cambia nada).

ALTER TABLE users
  MODIFY COLUMN credits DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE tables_
  MODIFY COLUMN ante_value DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE table_players
  MODIFY COLUMN table_balance DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE partidas
  MODIFY COLUMN ante_value DECIMAL(10,2) UNSIGNED NOT NULL,
  MODIFY COLUMN fondo_acumulado DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE manos
  MODIFY COLUMN fondo_before DECIMAL(10,2) NOT NULL,
  MODIFY COLUMN fondo_after DECIMAL(10,2) NULL;

ALTER TABLE mano_players
  MODIFY COLUMN paid_penalty DECIMAL(10,2) NOT NULL DEFAULT 0,
  MODIFY COLUMN received_payout DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE credit_transactions
  MODIFY COLUMN amount DECIMAL(10,2) NOT NULL;
