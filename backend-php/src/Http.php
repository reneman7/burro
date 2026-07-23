<?php

namespace Burro;

final class Http
{
    public static function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function error(string $message, int $status = 400): never
    {
        self::json(['error' => $message], $status);
    }

    /** @return array<string,mixed> */
    public static function body(): array
    {
        $raw = file_get_contents('php://input');
        if ($raw === false || $raw === '') {
            return [];
        }

        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    /**
     * Extrae y verifica el JWT del header X-Auth-Token: <token>.
     * Termina la petición con 401 si falta o es inválido.
     *
     * Nota: usamos un header propio en vez del estándar "Authorization"
     * porque algunos hostings compartidos (IONOS entre ellos) lo descartan
     * antes de que llegue a PHP, mientras que los headers X- personalizados
     * sí pasan sin problema.
     *
     * @return array{sub:int, username:string, role:string}
     */
    public static function requireAuth(): array
    {
        $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
        if ($token === '') {
            self::error('No autenticado', 401);
        }

        $claims = Jwt::verify($token);
        if ($claims === null) {
            self::error('Token inválido o expirado', 401);
        }

        return $claims;
    }

    public static function requireAdmin(): array
    {
        $claims = self::requireAuth();
        if ($claims['role'] !== 'admin') {
            self::error('Requiere rol de administrador', 403);
        }
        return $claims;
    }

    /**
     * Autenticación servicio-a-servicio para el servicio Node (que no tiene
     * acceso directo a MySQL en producción). No representa a ningún usuario;
     * solo confirma que quien llama conoce la clave interna compartida.
     */
    public static function requireInternalAuth(): void
    {
        $key = $_SERVER['HTTP_X_INTERNAL_KEY'] ?? '';
        if (!hash_equals(Config::internalApiKey(), $key)) {
            self::error('No autorizado', 401);
        }
    }
}
