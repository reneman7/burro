<?php

namespace Burro\Controllers;

use Burro\Db;
use Burro\Http;
use Burro\Jwt;
use Burro\Money;

final class AuthController
{
    public function register(): never
    {
        $body = Http::body();
        $username = trim((string) ($body['username'] ?? ''));
        $password = (string) ($body['password'] ?? '');

        if (strlen($username) < 3 || strlen($username) > 32) {
            Http::error('El usuario debe tener entre 3 y 32 caracteres');
        }
        if (strlen($password) < 6) {
            Http::error('La contraseña debe tener al menos 6 caracteres');
        }

        $db = Db::get();

        $stmt = $db->prepare('SELECT id FROM users WHERE username = ?');
        $stmt->execute([$username]);
        if ($stmt->fetch() !== false) {
            Http::error('Ese nombre de usuario ya está en uso', 409);
        }

        $hash = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $db->prepare(
            'INSERT INTO users (username, password_hash, credits, role) VALUES (?, ?, 0, \'player\')'
        );
        $stmt->execute([$username, $hash]);
        $userId = (int) $db->lastInsertId();

        $token = Jwt::issue($userId, $username, 'player');

        Http::json([
            'token' => $token,
            'user' => ['id' => $userId, 'username' => $username, 'role' => 'player', 'credits' => 0],
        ], 201);
    }

    public function login(): never
    {
        $body = Http::body();
        $username = trim((string) ($body['username'] ?? ''));
        $password = (string) ($body['password'] ?? '');

        $db = Db::get();
        $stmt = $db->prepare(
            'SELECT id, username, password_hash, credits, role, is_active FROM users WHERE username = ?'
        );
        $stmt->execute([$username]);
        $user = $stmt->fetch();

        if ($user === false || !password_verify($password, $user['password_hash'])) {
            Http::error('Usuario o contraseña incorrectos', 401);
        }
        if ((int) $user['is_active'] === 0) {
            Http::error('Esta cuenta está deshabilitada', 403);
        }

        $token = Jwt::issue((int) $user['id'], $user['username'], $user['role']);

        Http::json([
            'token' => $token,
            'user' => [
                'id' => (int) $user['id'],
                'username' => $user['username'],
                'role' => $user['role'],
                'credits' => Money::of($user['credits']),
            ],
        ]);
    }

    public function me(): never
    {
        $claims = Http::requireAuth();

        $db = Db::get();
        $stmt = $db->prepare('SELECT id, username, credits, role FROM users WHERE id = ?');
        $stmt->execute([$claims['sub']]);
        $user = $stmt->fetch();

        if ($user === false) {
            Http::error('Usuario no encontrado', 404);
        }

        Http::json([
            'id' => (int) $user['id'],
            'username' => $user['username'],
            'role' => $user['role'],
            'credits' => Money::of($user['credits']),
        ]);
    }
}
