/**
 * Tokens de servicio: la identidad de `voz` y de todo lo que no es una persona.
 *
 * EL PROBLEMA QUE CIERRA
 * Hasta hoy `voz` se autenticaba con OPERADOR_PASSWORD — la contraseña de turno
 * de los humanos. Dos consecuencias, las dos malas:
 *   1. En la auditoría un bot y una persona son indistinguibles.
 *   2. `voz` puede hacer TODO lo que puede un humano, incluido aceptar un
 *      traslado en nombre de un hospital. Un webhook de WhatsApp mal formado no
 *      puede tener la llave de una decisión clínica.
 *
 * EL MODELO
 * Un token de servicio lleva `tip: 'servicio'`, `sub: 'svc:<nombre>'` y una
 * lista de alcances. El guard global lo deja pasar SOLO por las rutas cuyo
 * alcance el token declara. Todo lo demás es 403.
 *
 * ── POR QUÉ UNA TABLA DE RUTAS Y NO SOLO UN DECORADOR ───────────────
 * `@Alcance()` existe (alcance.decorator.ts) y gana cuando está puesto. Pero la
 * defensa no puede depender de que alguien se acuerde de decorar su
 * controlador: una ruta nueva sin decorador quedaría abierta a cualquier
 * servicio. Por eso esta tabla es una LISTA BLANCA — lo que no está declarado
 * aquí ni decorado allá, un token de servicio no lo alcanza. Es el mismo
 * criterio de `estado.service.ts::despojar()`: campo por campo, a propósito, y
 * si algo falta el sistema niega en vez de adivinar.
 *
 * Los tokens HUMANOS no pasan por esto: siguen funcionando exactamente igual
 * que ayer. La restricción de alcance por rol humano llega con la tarea 1.3
 * (identidad real), y este archivo está escrito para que 1.3 aterrice encima
 * — no para que la rehaga.
 */

/**
 * Los permisos que hoy sabe distinguir el guard. Es un subconjunto de la matriz
 * de docs/multitenancy-y-autenticacion.md §5.2: aquí solo están los que alguna
 * ruta de core usa realmente. Agregar uno sin cablearlo a una ruta no protege
 * nada, así que la lista se queda corta a propósito.
 */
export const ALCANCES = [
  'caso:crear',
  'caso:leer',
  'notificar',
  'handshake:responder',
  'capacidad:declarar',
  'caso:escalar',
  'escalamiento:atender',
] as const;

export type Alcance = (typeof ALCANCES)[number];

/**
 * Lo que puede `voz`, y nada más: crear el caso que dictó el paramédico,
 * leerlo y avisarle a la sede. **No** puede responder un handshake (aceptar un
 * traslado es una decisión humana — regla 6 del repo) ni declarar capacidad
 * (eso lo firma el hospital, no el canal por el que llegó el mensaje).
 */
export const ALCANCE_VOZ: readonly Alcance[] = [
  'caso:crear',
  'caso:leer',
  'notificar',
];

/**
 * Alcance por defecto de cada servicio conocido. Sirve para que emitir el token
 * de `voz` no dependa de que quien corra el comando recuerde los tres strings:
 * un dedo de más en un curl no puede ser la diferencia entre un bot que
 * notifica y un bot que acepta pacientes.
 */
export const ALCANCE_POR_SERVICIO: Readonly<
  Record<string, readonly Alcance[]>
> = {
  voz: ALCANCE_VOZ,
};

/** Prefijo del `sub`. Lo que hace que la auditoría distinga bot de persona. */
export const PREFIJO_SERVICIO = 'svc:';

/**
 * Nombres aceptables de servicio. Sin mayúsculas ni tildes ni espacios: el
 * `sub` termina en logs y en eventos de auditoría, y ahí un nombre libre es un
 * campo inyectable.
 */
export const NOMBRE_SERVICIO = /^[a-z][a-z0-9-]{1,30}$/;

export interface CargaServicio {
  sub: string;
  /** Ausente = token humano de antes de esta tarea. Ver sesion.service.ts. */
  tip: 'servicio';
  alc: Alcance[];
  exp: number;
}

export function esAlcance(valor: unknown): valor is Alcance {
  return (
    typeof valor === 'string' && (ALCANCES as readonly string[]).includes(valor)
  );
}

/**
 * Tabla ruta → alcance. **Lista blanca: lo que no está aquí, ningún token de
 * servicio lo alcanza.**
 *
 * Ojo con las rutas con parámetro (`/casos/:id`): esta tabla compara la ruta
 * literal, así que para esas hay que usar `@Alcance()` en el controlador, que
 * gana sobre la tabla y no depende del texto de la URL.
 */
const RUTAS: Readonly<Record<string, Alcance>> = {
  // Las cuatro que usa `voz` (app/despachador.py).
  'POST /triage': 'caso:crear',
  'POST /match': 'caso:leer',
  'GET /estado': 'caso:leer',
  // `/dispatch` dispara el handshake, o sea: le avisa a la sede candidata.
  // La matriz del doc §5.2 lo llama `caso:despachar` y también se lo concede a
  // `voz`; mientras el alcance de `voz` sean tres strings fijos (tarea 1.8,
  // paso 2), la fila vive bajo `notificar`. Cuando 1.3 traiga la matriz
  // completa de roles, esto pasa a `caso:despachar` y el alcance lo incluye.
  'POST /dispatch': 'notificar',

  // Las que un servicio NO debería alcanzar. Están listadas —en vez de dejarlas
  // caer en el deny por omisión— para que el 403 diga qué alcance faltó y para
  // que se lea, de un vistazo, cuál es la frontera.
  'POST /handshake/respond': 'handshake:responder',
  'POST /escalamiento': 'caso:escalar',
  'POST /escalamiento/atender': 'escalamiento:atender',
};

/**
 * El alcance que exige una ruta, o `undefined` si no está declarada — y
 * `undefined` significa NEGAR para un token de servicio, nunca permitir.
 */
export function alcanceDeRuta(
  metodo: string,
  ruta: string,
): Alcance | undefined {
  return RUTAS[`${metodo.toUpperCase()} ${normalizarRuta(ruta)}`];
}

/** `/estado/` y `/estado` son la misma ruta para express; que lo sean aquí. */
function normalizarRuta(ruta: string): string {
  const sinQuery = ruta.split('?')[0];
  return sinQuery.length > 1 ? sinQuery.replace(/\/+$/, '') : sinQuery;
}
