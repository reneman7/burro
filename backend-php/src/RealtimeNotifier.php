<?php

namespace Burro;

/**
 * Avisa directamente al servicio de Node cuando cambia el estado de una
 * mesa (crear, unirse, cambiar apuesta, iniciar partida, recargar fichas),
 * en vez de depender de que el socket del jugador que hizo la acción esté
 * listo para reenviar el aviso él mismo (eso causaba que otros jugadores
 * en la sala de espera no vieran los cambios sin refrescar la página).
 *
 * Es "mejor esfuerzo": si el servicio de Node está dormido o no responde a
 * tiempo, no debe romper la operación real (ya se guardó en la base de
 * datos); el jugador que hizo la acción de todas formas ve su propio
 * resultado de inmediato por la respuesta normal de la API.
 */
final class RealtimeNotifier
{
    private const TIMEOUT_SECONDS = 3;

    public static function tableChanged(int $tableId): void
    {
        $ch = curl_init(rtrim(Config::realtimeUrl(), '/') . '/notify/table-changed');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode(['tableId' => $tableId]),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'X-Internal-Key: ' . Config::internalApiKey(),
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => self::TIMEOUT_SECONDS,
            CURLOPT_CONNECTTIMEOUT => self::TIMEOUT_SECONDS,
        ]);
        curl_exec($ch);
        curl_close($ch);
    }
}
