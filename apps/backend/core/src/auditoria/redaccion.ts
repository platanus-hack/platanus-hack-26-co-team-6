/**
 * Qué se tacha antes de que el expediente salga del servidor.
 *
 * ── DOS CAPAS, Y NO SON LA MISMA ──────────────────────────────────
 *
 * 1. **PII absoluta.** `textoCrudo` (el dictado literal) y `origen` (dónde
 *    está el paciente) NO SALEN DEL SERVIDOR. Punto — no hay rol que los
 *    desbloquee, igual que no salen por `GET /estado`. La lista blanca de
 *    `estado.service.ts::despojar()` protege el listado; esto protege el
 *    expediente, que es la otra puerta y la que se exporta a JSON y a PDF.
 *
 * 2. **Redacción por rol.** El auditor externo (una interventoría, la
 *    Supersalud) audita el PROCESO: qué sedes se evaluaron, por qué se
 *    descartaron, cuánto tardó cada paso, quién firmó qué. Para eso le sirve
 *    lo CODIFICADO —triage, CIE-10, servicios REPS, minutos— y no le hace
 *    falta la narrativa del paciente, que es texto libre transcrito de un
 *    dictado y por lo tanto el sitio donde la PII se cuela sin que nadie la
 *    haya puesto ahí a propósito ("el señor Pérez de la carrera 30…").
 *
 *    El regulador del CRUE y el `admin_organizacion` del caso sí la ven:
 *    son actores operativos que ya la tienen en su consola, bajo la
 *    excepción de urgencia (Ley 2015/2020).
 *
 * ── POR QUÉ SE MARCA EN VEZ DE DESAPARECER ────────────────────────
 * Un campo tachado dice "esto existe y no te toca"; un campo ausente dice
 * "esto no existe". Lo segundo es mentirle a un auditor, y además le impide
 * pedirlo por la vía que corresponda. Se tacha y se lista qué se tachó.
 */

export const MARCA = '[redactado]';

/** No sale para nadie. Ni para el CRUE, ni para un juez por esta vía. */
export const PII_ABSOLUTA = [
  'textoCrudo',
  'texto_crudo',
  'dictado',
  'texto',
  'origen',
  'telefono',
  'telefonoReporta',
  'telefono_reporta',
  'pacienteToken',
  'paciente_token',
] as const;

/**
 * Narrativa clínica en texto libre. Sale para los actores operativos y no
 * para el auditor externo. Lo codificado (`triage`, `dxCie10`,
 * `serviciosRequeridos`, `complejidadRequerida`, `confianza`) sale siempre:
 * es lo que hace auditable la decisión de ruteo.
 */
export const NARRATIVA_CLINICA = [
  'resumen',
  'dxDescripcion',
  'signosAlarma',
  'edad',
  'sexo',
] as const;

/** Los tres roles que pueden abrir un expediente (tarea 4.12, paso 6). */
export const ROLES_LECTORES = [
  'auditor',
  'regulador_crue',
  'admin_organizacion',
] as const;

export type RolLector = (typeof ROLES_LECTORES)[number];

export interface PoliticaRedaccion {
  rol: RolLector;
  /** Nombres de campo que este rol no verá, con su motivo. */
  claves: string[];
  motivo: string;
}

export function politicaDe(rol: RolLector): PoliticaRedaccion {
  return rol === 'auditor'
    ? {
        rol,
        claves: [...PII_ABSOLUTA, ...NARRATIVA_CLINICA],
        motivo:
          'Auditoría externa: se audita el proceso con los datos codificados. ' +
          'El dictado, la ubicación del paciente y la narrativa clínica en ' +
          'texto libre no salen del servidor.',
      }
    : {
        rol,
        claves: [...PII_ABSOLUTA],
        motivo:
          'Actor operativo del caso: ve la narrativa clínica bajo la excepción ' +
          'de urgencia. El dictado literal y la ubicación del paciente no ' +
          'salen del servidor para nadie.',
      };
}

/**
 * El rol con el que se lee, cuando el actor tiene varios.
 *
 * Gana el MENOS redactado de los que tiene: si alguien es a la vez auditor y
 * regulador del CRUE, es regulador — negarle lo que su otro rol ya le muestra
 * en su consola no protege nada, solo lo empuja a mirar por otra pantalla.
 */
export function rolLector(roles: readonly string[]): RolLector | null {
  for (const candidato of ['regulador_crue', 'admin_organizacion', 'auditor'] as const) {
    if (roles.includes(candidato)) return candidato;
  }
  return null;
}

export interface Redactado<T> {
  valor: T;
  /** Qué campos se tacharon, sin repetir. Va en la respuesta. */
  redactados: string[];
}

/**
 * Recorre el valor y tacha por NOMBRE DE CAMPO, a cualquier profundidad.
 *
 * Por nombre y no por ruta a propósito: `inputs.origen`, `detalle.origen` y
 * `candidatos[3].contexto.origen` son el mismo dato y el mismo riesgo. Una
 * lista de rutas exactas se queda corta el día que alguien anide una más.
 */
export function redactar<T>(valor: T, claves: readonly string[]): Redactado<T> {
  const prohibidas = new Set<string>(claves);
  const redactados = new Set<string>();

  const caminar = (nodo: unknown, profundidad: number): unknown => {
    // Un tope de profundidad evita que un objeto cíclico o absurdamente
    // anidado tumbe la petición. A los 12 niveles ya no hay dato honesto.
    if (profundidad > 12) return MARCA;
    if (Array.isArray(nodo)) return nodo.map((x) => caminar(x, profundidad + 1));
    if (nodo === null || typeof nodo !== 'object') return nodo;

    const salida: Record<string, unknown> = {};
    for (const [clave, sub] of Object.entries(nodo as Record<string, unknown>)) {
      if (prohibidas.has(clave)) {
        redactados.add(clave);
        salida[clave] = MARCA;
        continue;
      }
      salida[clave] = caminar(sub, profundidad + 1);
    }
    return salida;
  };

  return {
    valor: caminar(valor, 0) as T,
    redactados: [...redactados].sort(),
  };
}
