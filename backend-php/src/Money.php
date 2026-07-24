<?php

namespace Burro;

/**
 * Los montos de créditos/fichas se guardan en columnas DECIMAL(10,2), que PDO
 * siempre devuelve como string (nunca int/float nativo, ni con prepares
 * emulados ni nativos). Este helper centraliza el parseo consistente a float
 * redondeado a 2 decimales, tanto al leer de la DB como al parsear el body
 * de un request.
 */
final class Money
{
    public static function of(mixed $value): float
    {
        return round((float) $value, 2);
    }
}
