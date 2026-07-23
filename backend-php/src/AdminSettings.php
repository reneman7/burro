<?php

namespace Burro;

final class AdminSettings
{
    private const DEFAULTS = [
        'min_players_per_partida' => '3',
        'max_players_per_table' => '5',
        'max_card_exchange' => '5',
        'turn_timeout_seconds' => '30',
    ];

    public static function getInt(string $key): int
    {
        $stmt = Db::get()->prepare('SELECT setting_value FROM admin_settings WHERE setting_key = ?');
        $stmt->execute([$key]);
        $row = $stmt->fetch();

        if ($row !== false) {
            return (int) $row['setting_value'];
        }

        return (int) (self::DEFAULTS[$key] ?? 0);
    }
}
