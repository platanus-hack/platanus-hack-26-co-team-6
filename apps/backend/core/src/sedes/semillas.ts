/**
 * Catalogo local de sedes: el que se usa cuando Supabase no esta configurado.
 *
 * ⚠️ ESTO YA NO SON SEMILLAS ESCRITAS A MANO.
 *
 * Hasta el commit anterior habia aqui 14 sedes inventadas, con coordenadas
 * aproximadas y servicios "ILUSTRATIVOS". Ahora son las 84 IPS con servicio de
 * urgencias que la Secretaria de Salud publica, con coordenadas, complejidad,
 * subred y telefono reales, y con el codigo de habilitacion REPS de 81 de
 * ellas.
 *
 * Lo genera `python scripts/datos/construir.py` desde data/. Para cambiar el
 * contenido se cambia la fuente o su transformador, nunca este archivo ni
 * catalogo.generado.ts.
 *
 * Que sigue siendo inferido y no medido — leerlo antes del pitch:
 *   servicios[]  se derivan del nivel de complejidad (REPS no publica abierto
 *                el detalle por sede).
 *   camas[]      se reparten desde la distribucion real de la ciudad.
 *   ocupadas     salen de la ocupacion REAL de la subred de cada sede.
 * Ver la cabecera de scripts/datos/transformadores/sedes.py.
 */

import { SEDES_CATALOGO } from './catalogo.generado';

/**
 * El nombre se conserva porque lo importa sedes.service.ts, pero ya no es un
 * mock: son datos publicos verificables. Ver data/CATALOGO.md.
 */
export const SEDES_MOCK = SEDES_CATALOGO;

export const ORIGEN_DEMO = { lat: 4.5981, lng: -74.0758 };
