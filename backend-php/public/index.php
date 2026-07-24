<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use Burro\Controllers\AuthController;
use Burro\Controllers\InternalController;
use Burro\Controllers\TableController;
use Burro\Controllers\UserController;
use Burro\Http;

// CORS: el frontend y el servicio Node viven en otros orígenes (Vite en
// desarrollo; el dominio del subdominio + Render en producción).
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-Auth-Token, X-Internal-Key');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';

// Quita el prefijo hasta /api si la app vive en una subcarpeta (p. ej. /burro/backend-php/public/api/...)
$path = preg_replace('#^.*?(/api/.*)$#', '$1', $path);
$path = rtrim($path, '/');
if ($path === '') {
    $path = '/';
}

// Rutas estáticas (coincidencia exacta).
$routes = [
    'POST /api/auth/register' => [AuthController::class, 'register'],
    'POST /api/auth/login' => [AuthController::class, 'login'],
    'GET /api/auth/me' => [AuthController::class, 'me'],

    'POST /api/tables' => [TableController::class, 'create'],
    'POST /api/tables/join' => [TableController::class, 'join'],
    'GET /api/tables' => [TableController::class, 'list'],

    'GET /api/users/me/transactions' => [UserController::class, 'transactions'],
    'POST /api/users/me/recharge' => [UserController::class, 'recharge'],

    'GET /api/internal/health' => [InternalController::class, 'health'],
    'POST /api/internal/manos' => [InternalController::class, 'createMano'],
];

$key = $method . ' ' . $path;
if (isset($routes[$key])) {
    [$class, $action] = $routes[$key];
    (new $class())->$action();
}

// Rutas con parámetros (p. ej. /api/tables/{code}/ante).
$paramRoutes = [
    'GET #^/api/tables/([A-Za-z0-9]+)$#' => [TableController::class, 'show'],
    'GET #^/api/tables/([A-Za-z0-9]+)/mano-history$#' => [TableController::class, 'manoHistory'],
    'PUT #^/api/tables/([A-Za-z0-9]+)/ante$#' => [TableController::class, 'updateAnte'],
    'POST #^/api/tables/([A-Za-z0-9]+)/start$#' => [TableController::class, 'startPartida'],
    'POST #^/api/tables/([A-Za-z0-9]+)/topup$#' => [TableController::class, 'topup'],
    'POST #^/api/tables/([A-Za-z0-9]+)/close$#' => [TableController::class, 'close'],

    'GET #^/api/internal/settings/([A-Za-z0-9_]+)$#' => [InternalController::class, 'getSetting'],
    'GET #^/api/internal/tables/([0-9]+)/seat-order$#' => [InternalController::class, 'seatOrder'],
    'GET #^/api/internal/tables/([0-9]+)/active-partida$#' => [InternalController::class, 'activePartida'],
    'GET #^/api/internal/tables/([0-9]+)/next-dealer$#' => [InternalController::class, 'nextDealer'],
    'GET #^/api/internal/tables/([0-9]+)/balances$#' => [InternalController::class, 'tableBalances'],
    'GET #^/api/internal/tables/([0-9]+)/state$#' => [InternalController::class, 'tableState'],
    'GET #^/api/internal/partidas/([0-9]+)/mano-count$#' => [InternalController::class, 'manoCount'],
    'POST #^/api/internal/manos/([0-9]+)/finalize$#' => [InternalController::class, 'finalizeMano'],
    'POST #^/api/internal/manos/([0-9]+)/players$#' => [InternalController::class, 'insertManoPlayers'],
    'POST #^/api/internal/manos/([0-9]+)/tricks$#' => [InternalController::class, 'insertTricks'],
    'POST #^/api/internal/manos/([0-9]+)/apply-payments$#' => [InternalController::class, 'applyManoPayments'],
    'POST #^/api/internal/partidas/([0-9]+)/charge-ante$#' => [InternalController::class, 'chargeAnte'],
    'POST #^/api/internal/partidas/([0-9]+)/finalize$#' => [InternalController::class, 'finalizePartida'],
];

foreach ($paramRoutes as $routeKey => [$class, $action]) {
    [$routeMethod, $pattern] = explode(' ', $routeKey, 2);
    if ($routeMethod !== $method) {
        continue;
    }
    if (preg_match($pattern, $path, $m)) {
        (new $class())->$action($m[1]);
    }
}

Http::error('Ruta no encontrada: ' . $key, 404);
