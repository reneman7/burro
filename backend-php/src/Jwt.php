<?php

namespace Burro;

use Firebase\JWT\JWT as FirebaseJwt;
use Firebase\JWT\Key;

final class Jwt
{
    public static function issue(int $userId, string $username, string $role): string
    {
        $now = time();
        $payload = [
            'sub' => $userId,
            'username' => $username,
            'role' => $role,
            'iat' => $now,
            'exp' => $now + Config::JWT_TTL_SECONDS,
        ];

        return FirebaseJwt::encode($payload, Config::jwtSecret(), 'HS256');
    }

    /**
     * @return array{sub:int, username:string, role:string, iat:int, exp:int}|null
     */
    public static function verify(string $token): ?array
    {
        try {
            $decoded = FirebaseJwt::decode($token, new Key(Config::jwtSecret(), 'HS256'));
            return (array) $decoded;
        } catch (\Throwable $e) {
            return null;
        }
    }
}
