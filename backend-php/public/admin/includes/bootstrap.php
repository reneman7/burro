<?php

declare(strict_types=1);

require dirname(__DIR__, 3) . '/vendor/autoload.php';

use Burro\Db;

session_start();

function admin_current_user(): ?array
{
    return $_SESSION['admin_user'] ?? null;
}

function admin_require_login(): array
{
    $user = admin_current_user();
    if ($user === null) {
        header('Location: login.php');
        exit;
    }
    return $user;
}

function admin_login(string $username, string $password): bool
{
    $stmt = Db::get()->prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $row = $stmt->fetch();

    if ($row === false || !password_verify($password, $row['password_hash']) || $row['role'] !== 'admin') {
        return false;
    }

    $_SESSION['admin_user'] = ['id' => (int) $row['id'], 'username' => $row['username']];
    return true;
}

function admin_logout(): void
{
    unset($_SESSION['admin_user']);
}

function h(?string $value): string
{
    return htmlspecialchars($value ?? '', ENT_QUOTES, 'UTF-8');
}
