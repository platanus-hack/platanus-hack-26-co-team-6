/**
 * Cruce de nombres para la autoverificacion — tareas 2.1 y 2.9.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  POR QUE NO ES UN `===`
 * ═══════════════════════════════════════════════════════════════════
 *  Hay que decidir si «CLINICA DEL COUNTRY S.A.» y «Clínica del Country»
 *  son la misma entidad. Son la misma, y no hay comparacion exacta que lo
 *  diga: el REPS guarda tildes y mayusculas de oracion, el CSV de transporte
 *  asistencial viene en MAYUSCULAS SIN TILDES y con `utf-8-sig`, y las dos
 *  fuentes puntuan las siglas distinto.
 *
 *  §3.3 pide «similitud > 0.85, pg_trgm». Esto es pg_trgm, en TypeScript.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  POR QUE EN TYPESCRIPT Y NO EN LA BASE
 * ═══════════════════════════════════════════════════════════════════
 *  Porque tiene que dar el MISMO numero con base y sin ella. Core arranca
 *  sin Supabase y lee las 84 sedes del catalogo compilado — si el puntaje lo
 *  pusiera Postgres, la afiliacion diria una cosa en el demo y otra en
 *  produccion, y esa es justo la clase de diferencia que nadie ve hasta que
 *  rechaza a una IPS de verdad.
 *
 *  El indice GIN de la migracion 0006 sigue sirviendo: acelera el
 *  pre-filtro `nombre % $1`. El puntaje que decide sale de aqui.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  LA DIFERENCIA DELIBERADA CON pg_trgm
 * ═══════════════════════════════════════════════════════════════════
 *  pg_trgm baja a minusculas pero NO quita tildes. Aqui si, porque el cruce
 *  que importa es exactamente entre una fuente con tildes y una sin ellas.
 *  El equivalente SQL es `similarity(unaccent(lower(a)), unaccent(lower(b)))`
 *  — que no se puede indexar directo porque `unaccent` no es IMMUTABLE.
 */

/**
 * §3.3. Por debajo de esto va a revision humana, NO se rechaza.
 *
 * ⚠️ 0.85 es ESTRICTO y conviene saber cuanto. Medido con nombres reales
 *    del catalogo:
 *
 *      «Clínica La Inmaculada»    vs «CLINICA LA INMACULADA»          1.00 ✓
 *      «Clínica del Country»      vs «CLINICA DEL COUNTRY SAS»        0.83 ✗
 *      «Clínica del Country SAS»  vs «CLINICA DEL COUNTRY S.A.S.»     0.77 ✗
 *      «...Cafam Floresta»        vs «CAFAM FLORESTA»                 0.36 ✗
 *      «Hospital de Usme»         vs «Hospital de Suba»               0.55 ✗
 *
 *    O sea: agregar la forma juridica ya baja del umbral. En la practica el
 *    camino sin tramite se autoverifica cuando el afiliado escribe el nombre
 *    como lo tiene el REPS, y en los demas casos pasa por un ojo humano.
 *
 *    Se deja en 0.85 porque es lo que dice el plan y porque el error caro es
 *    el otro: aprobar sola la afiliacion de una IPS contra el codigo REPS de
 *    otra mete al hospital equivocado en el ranking de urgencias. La ultima
 *    fila es la que manda — «Usme» y «Suba» dan 0.55, y cualquier umbral que
 *    deje pasar «Cafam Floresta» tambien las deja pasar a ellas.
 *
 *    Lo que si arregla el UX sin tocar el umbral: la respuesta de
 *    `/afiliacion/verificar` trae `sede.nombre`, y §3.4 paso 2 lo muestra.
 *    El afiliado ve el nombre del REPS y confirma — no adivina.
 */
export const UMBRAL_SIMILITUD = 0.85;

/**
 * Deja un nombre comparable: sin BOM, sin tildes, en minusculas y con la
 * puntuacion convertida en separador.
 *
 * El BOM es real y muerde: `data/CATALOGO.md` declara `utf-8-sig` para el
 * CSV de transporte asistencial. Un U+FEFF invisible al frente del primer
 * nombre cambia sus trigramas y ese prestador no cruza nunca — y como es UNO
 * solo, pasa por «ese no estaba en la lista» en vez de por bug.
 */
export function normalizar(texto: string): string {
  return (
    texto
      .replace(/\uFEFF/g, '')
      .normalize('NFD')
      // Marcas diacriticas combinantes. La ñ sobrevive: NFD la parte en n + ~,
      // esto se lleva la tilde y queda 'n'. Es lo que queremos — «MUNOZ» y
      // «Muñoz» son la misma clinica escrita por dos funcionarios distintos.
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      // Todo lo que no es letra o digito separa palabras, igual que pg_trgm.
      //
      // OJO: eso parte «S.A.S.» en tres palabras de una letra, que NO es lo
      // mismo que «SAS». Medido: 0.63 entre las dos. Se deja asi a proposito
      // —es lo que hace Postgres— y la consecuencia es que una razon social
      // con la forma juridica puntuada cae a revision humana en vez de
      // autoverificarse. Es el lado seguro del error.
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  );
}

/**
 * Los trigramas de pg_trgm, al pie de la letra.
 *
 * Cada palabra se acolcha con dos espacios delante y uno detras antes de
 * cortar en tres. Ese acolchado no es decoracion: es lo que hace que el
 * comienzo de una palabra pese, y por eso «country» y «encountry» no se
 * parecen tanto como su substring comun sugeriria.
 */
export function trigramas(texto: string): Set<string> {
  const salida = new Set<string>();
  for (const palabra of normalizar(texto).split(' ')) {
    if (!palabra) continue;
    const acolchada = `  ${palabra} `;
    for (let i = 0; i + 3 <= acolchada.length; i++) {
      salida.add(acolchada.slice(i, i + 3));
    }
  }
  return salida;
}

/**
 * Jaccard sobre los trigramas: |A ∩ B| / |A ∪ B|. 0 = nada que ver, 1 = igual.
 *
 * Dos cadenas vacias dan 0 y no 1, a proposito: «no se parecen» es la
 * respuesta segura cuando no hay con que comparar. Un 1 aqui aprobaria una
 * afiliacion sin razon social.
 */
export function similitud(a: string, b: string): number {
  const ta = trigramas(a);
  const tb = trigramas(b);
  if (!ta.size || !tb.size) return 0;

  let comunes = 0;
  for (const t of ta) if (tb.has(t)) comunes++;

  // |A ∪ B| = |A| + |B| − |A ∩ B|
  return comunes / (ta.size + tb.size - comunes);
}

/** El mejor candidato de una lista, con su puntaje. `undefined` si esta vacia. */
export function masParecido<T>(
  consulta: string,
  candidatos: readonly T[],
  nombreDe: (candidato: T) => string,
): { candidato: T; puntaje: number } | undefined {
  let mejor: { candidato: T; puntaje: number } | undefined;
  for (const candidato of candidatos) {
    const puntaje = similitud(consulta, nombreDe(candidato));
    if (!mejor || puntaje > mejor.puntaje) mejor = { candidato, puntaje };
  }
  return mejor;
}
