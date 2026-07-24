<?php

namespace Burro;

final class Config
{
    private static ?array $local = null;

    /**
     * Carga backend-php/config.local.php si existe (fuera de public/, nunca
     * accesible por la web). Sirve de respaldo para producción cuando el
     * hosting no permite configurar variables de entorno de PHP fácilmente
     * (algunos planes de Plesk con PHP-FPM no propagan SetEnv de .htaccess).
     * Nunca debe subirse a control de versiones ni copiarse dentro de public/.
     *
     * @return array<string,string>
     */
    private static function local(): array
    {
        if (self::$local === null) {
            $path = dirname(__DIR__) . '/config.local.php';
            self::$local = file_exists($path) ? require $path : [];
        }
        return self::$local;
    }

    private static function value(string $key, string $default): string
    {
        $env = getenv($key);
        if ($env !== false && $env !== '') {
            return $env;
        }
        return self::local()[$key] ?? $default;
    }

    public static function dbHost(): string
    {
        return self::value('DB_HOST', '127.0.0.1');
    }

    public static function dbName(): string
    {
        return self::value('DB_NAME', 'burro');
    }

    public static function dbUser(): string
    {
        return self::value('DB_USER', 'root');
    }

    public static function dbPass(): string
    {
        return self::value('DB_PASS', '');
    }

    // Debe ser exactamente el mismo secreto configurado en realtime-node/.env (JWT_SECRET)
    // para que el servicio Node pueda verificar los tokens emitidos aquí.
    public static function jwtSecret(): string
    {
        return self::value('JWT_SECRET', 'burro-dev-secret-change-me-please-32bytes-min');
    }

    public const JWT_TTL_SECONDS = 60 * 60 * 12; // 12 horas

    // Clave compartida para la API interna que usa el servicio Node (que ya no
    // se conecta directo a MySQL). Debe coincidir con INTERNAL_API_KEY en
    // realtime-node/.env. Nunca debe usarse para autenticar usuarios reales.
    public static function internalApiKey(): string
    {
        return self::value('INTERNAL_API_KEY', 'burro-dev-internal-key-change-me-too');
    }

    // Base del servicio de tiempo real (Node), para que PHP le avise
    // directamente cuando cambia el estado de una mesa (ver RealtimeNotifier).
    public static function realtimeUrl(): string
    {
        return self::value('REALTIME_URL', 'http://localhost:4000');
    }
}
