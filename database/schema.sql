-- Burro - esquema de base de datos
-- Charset utf8mb4 en todo, InnoDB para integridad referencial.

CREATE DATABASE IF NOT EXISTS burro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE burro;

-- ---------------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(32) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  credits       INT NOT NULL DEFAULT 0,       -- saldo global (fichas virtuales)
  role          ENUM('player','admin') NOT NULL DEFAULT 'player',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Configuración global editable desde el panel admin
-- ---------------------------------------------------------------------------
CREATE TABLE admin_settings (
  setting_key   VARCHAR(64) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Mesas
-- ---------------------------------------------------------------------------
CREATE TABLE tables_ (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code        CHAR(6) NOT NULL UNIQUE,
  name        VARCHAR(64) NOT NULL,
  created_by  INT UNSIGNED NOT NULL,
  ante_value  INT UNSIGNED NOT NULL DEFAULT 1,
  status      ENUM('waiting','playing','finished') NOT NULL DEFAULT 'waiting',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- Asientos / jugadores de una mesa (persiste entre partidas de la misma mesa)
CREATE TABLE table_players (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  table_id      INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  seat_order    INT UNSIGNED NOT NULL,        -- orden de llegada = orden de turno
  table_balance INT NOT NULL DEFAULT 0,        -- fichas de mesa (buy-in), separado del saldo global
  status        ENUM('active','spectator','left') NOT NULL DEFAULT 'active',
  joined_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_table_user (table_id, user_id),
  FOREIGN KEY (table_id) REFERENCES tables_(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Partidas (sesión completa hasta que todos se salven)
-- ---------------------------------------------------------------------------
CREATE TABLE partidas (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  table_id          INT UNSIGNED NOT NULL,
  ante_value        INT UNSIGNED NOT NULL,
  mandatory_manos   INT UNSIGNED NOT NULL,
  fondo_acumulado   INT NOT NULL DEFAULT 0,     -- fondo de apuestas, crece cada mano
  status            ENUM('active','finished') NOT NULL DEFAULT 'active',
  started_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at          DATETIME NULL,
  FOREIGN KEY (table_id) REFERENCES tables_(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Manos (reparto de 5 cartas dentro de una partida)
-- ---------------------------------------------------------------------------
CREATE TABLE manos (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  partida_id    INT UNSIGNED NOT NULL,
  mano_number   INT UNSIGNED NOT NULL,
  dealer_user_id INT UNSIGNED NOT NULL,
  is_mandatory  TINYINT(1) NOT NULL,
  trump_suit    ENUM('diamantes','espadas','corazones','treboles') NULL,
  fondo_before  INT NOT NULL,
  fondo_after   INT NULL,
  status        ENUM('dealing','exchanging','entering','playing','finished') NOT NULL DEFAULT 'dealing',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partida_id) REFERENCES partidas(id),
  FOREIGN KEY (dealer_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Participación de cada jugador en una mano específica
CREATE TABLE mano_players (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  mano_id         INT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NOT NULL,
  entered         TINYINT(1) NOT NULL DEFAULT 1,
  exchanged_count TINYINT UNSIGNED NULL,
  points          TINYINT UNSIGNED NOT NULL DEFAULT 0,
  saved           TINYINT(1) NOT NULL DEFAULT 0,
  renounced       TINYINT(1) NOT NULL DEFAULT 0,
  paid_penalty    INT NOT NULL DEFAULT 0,
  received_payout INT NOT NULL DEFAULT 0,
  UNIQUE KEY uniq_mano_user (mano_id, user_id),
  FOREIGN KEY (mano_id) REFERENCES manos(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Bazas dentro de una mano
CREATE TABLE tricks (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  mano_id        INT UNSIGNED NOT NULL,
  trick_number   TINYINT UNSIGNED NOT NULL,
  leader_user_id INT UNSIGNED NOT NULL,
  winner_user_id INT UNSIGNED NULL,
  led_suit       ENUM('diamantes','espadas','corazones','treboles') NULL,
  FOREIGN KEY (mano_id) REFERENCES manos(id),
  FOREIGN KEY (leader_user_id) REFERENCES users(id),
  FOREIGN KEY (winner_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Cartas jugadas dentro de una baza
CREATE TABLE trick_plays (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trick_id    INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  card        CHAR(3) NOT NULL,       -- ej: "4D" (4 diamantes), "KH" (rey corazones)
  play_order  TINYINT UNSIGNED NOT NULL,
  is_achico   TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (trick_id) REFERENCES tricks(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Ledger de movimientos de créditos (auditoría completa)
-- ---------------------------------------------------------------------------
CREATE TABLE credit_transactions (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  table_id     INT UNSIGNED NULL,
  amount       INT NOT NULL,           -- positivo = ingreso, negativo = egreso
  type         ENUM('buyin','cashout','ante','penalty','payout','admin_adjust','recharge') NOT NULL,
  reference_id INT UNSIGNED NULL,      -- id de mano/partida relacionada, según type
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (table_id) REFERENCES tables_(id)
) ENGINE=InnoDB;
