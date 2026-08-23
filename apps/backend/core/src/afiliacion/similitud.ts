/**
 * Similitud de nombres por trigramas — `pg_trgm` a mano.
 *
 * ── POR QUÉ A MANO ────────────────────────────────────────────────
 * Las tareas 2.1 y 2.9 piden `pg_trgm`, pero la extensión solo existe si hay
 * Postgres, y este módulo tiene que cruzar contra el catálogo compilado cuando
 * no lo hay (regla 2 de AGENTS.md). Meter una librería de similitud por veinte
 * líneas tampoco: son veinte líneas.
 *
 * Se copia el algoritmo exacto de `pg_trgm` para que el umbral 0.85 signifique
 * lo mismo aquí y en la base el día que el cruce se haga con `similarity()`:
 *
 *   1. la cadena se parte en palabras;
 *   2. cada palabra se rellena con DOS espacios delante y UNO detrás;
 *   3. se toman todos los trigramas de esa palabra rellenada;
 *   4. similitud = |A ∩ B| / |A ∪ B|  (Jaccard sobre los conjuntos).
 *
 *   show_trgm('word') = {"  w"," wo","wor","ord","rd "}   ← igual que aquí.
 *
 * ── LA TRAMPA QUE ESTO RESUELVE ───────────────────────────────────
 * El CSV de transporte asistencial viene en `utf-8-sig` y con los nombres en
 * MAYÚSCULAS SIN TILDES; el catálogo de sedes viene con tildes y capitalizado
 * ("Clínica La Inmaculada"); y el afiliado escribe lo que se le ocurra. Sin
 * normalizar antes de comparar, "CLINICA DEL COUNTRY S.A.S" y
 * "Clínica del Country SAS" son la misma empresa y NO cruzan.
 */

/**
 * Deja la cadena en la forma canónica de comparación: sin tildes, en
 * mayúsculas, sin puntuación y con las siglas pegadas.
 *
 * El último paso es el que más rinde: al quitar la puntuación, `S.A.S` queda
 * como `S A S`, y pegar toda corrida de letras sueltas lo vuelve `SAS`. Con
 * eso `S.A.S`, `S A S`, `S.A.S.` y `SAS` colapsan en el mismo token, y lo
 * mismo pasa con `E.S.E`, `I.P.S` y `S.A`. La `Y` de "AMBULANCIAS Y SERVICIOS"
 * sobrevive porque hace falta una corrida de DOS o más letras sueltas.
 */
export function normalizar(texto: string): string {
  return (
    texto
      .normalize('NFD')
      // Marcas diacríticas Unicode: las tildes quedan sueltas tras el NFD.
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      // Cualquier cosa que no sea letra o dígito separa palabras. La Ñ ya no
      // existe a esta altura: el NFD la partió en N + tilde y la tilde se fue.
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim()
      .replace(/\b(?:[A-Z] )+[A-Z]\b/g, (sigla) => sigla.replace(/ /g, ''))
      .replace(/ +/g, ' ')
  );
}

/** Los trigramas de `pg_trgm` para una cadena ya normalizada por dentro. */
export function trigramas(texto: string): Set<string> {
  const salida = new Set<string>();
  const normalizado = normalizar(texto);
  if (!normalizado) return salida;

  for (const palabra of normalizado.split(' ')) {
    const relleno = `  ${palabra} `;
    for (let i = 0; i + 3 <= relleno.length; i++) {
      salida.add(relleno.slice(i, i + 3));
    }
  }
  return salida;
}

/**
 * 0..1. Dos cadenas que normalizan igual dan exactamente 1.
 *
 * Dos cadenas vacías dan 0 y no 1: "no hay con qué comparar" no puede
 * presentarse como "coincidencia perfecta" — sería el peor falso positivo
 * posible en un flujo que decide quién entra al sistema.
 */
export function similitud(a: string, b: string): number {
  const ta = trigramas(a);
  const tb = trigramas(b);
  if (ta.size === 0 || tb.size === 0) return 0;

  let comunes = 0;
  for (const t of ta) if (tb.has(t)) comunes++;

  return comunes / (ta.size + tb.size - comunes);
}

/**
 * El umbral de §3.3: por encima, el nombre "coincide" y la verificación puede
 * ser automática. Se compara con `>`, no con `>=`, porque así está escrito en
 * el documento.
 */
export const UMBRAL_COINCIDENCIA = 0.85;

/**
 * Por debajo de esto ni siquiera se sugiere el candidato más cercano: sería
 * ruido y, en un endpoint público, un enumerador con autocompletado.
 */
export const UMBRAL_SUGERENCIA = 0.5;

/** El más parecido de una lista, con su puntaje. `null` si la lista va vacía. */
export function masParecido<T>(
  consulta: string,
  candidatos: readonly T[],
  nombresDe: (candidato: T) => readonly string[],
): { candidato: T; puntaje: number } | null {
  let mejor: { candidato: T; puntaje: number } | null = null;

  for (const candidato of candidatos) {
    for (const nombre of nombresDe(candidato)) {
      const puntaje = similitud(consulta, nombre);
      if (!mejor || puntaje > mejor.puntaje) mejor = { candidato, puntaje };
    }
  }
  return mejor;
}
