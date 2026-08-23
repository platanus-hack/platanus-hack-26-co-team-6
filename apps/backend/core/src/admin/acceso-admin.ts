/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  EL UNICO SITIO DONDE SE DECIDE QUIEN ADMINISTRA LA          ║
 * ║  PLATAFORMA. Provisional hasta la tarea 1.3 (identidad real  ║
 * ║  con actores y roles) y 3.12.                                ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * ── EL PROBLEMA DE HOY ────────────────────────────────────────────
 * `core/src/auth` no sabe quien eres. Hay UNA contrasena de turno compartida
 * (`OPERADOR_PASSWORD`) y el token que emite solo dice `sub: 'operador'`. No
 * hay actores, no hay organizaciones y no hay roles: `admin_plataforma` es
 * hoy un nombre en `docs/multitenancy-y-autenticacion.md` y en
 * `apps/frontend/lib/sesion-modelo.ts`, no un dato que core pueda verificar.
 *
 * ── LO QUE ESTA FUNCION NO HACE ───────────────────────────────────
 * No degrada a permisivo. La regla 2 del repo ("todo degrada y lo dice")
 * tiene UNA excepcion escrita en AGENTS.md, y es exactamente esta: en
 * autenticacion un fallback abierto *es* la vulnerabilidad. Sin credencial
 * configurada, esto niega. Siempre. `SesionService.verificarAdminPlataforma()`
 * ya toma esa misma decision para `POST /auth/servicio` y este modulo se cuelga
 * de ella en vez de inventar una segunda puerta.
 *
 * ── LA LINEA QUE CAMBIA CUANDO LLEGUE 1.3 ─────────────────────────
 * Es el bloque marcado `[1.3]` mas abajo: hoy `carga.roles` viene `undefined`
 * porque `Carga` (sesion.service.ts) no tiene ese campo todavia, asi que el
 * bloque nunca dispara y la decision cae al puente del token de plataforma.
 * El dia que 1.3 agregue `roles` al token firmado, ese bloque empieza a mandar
 * SOLO y el puente deja de alcanzarse — sin tocar una linea de este archivo.
 *
 * Lo que 1.3 tiene que borrar despues, a mano y a proposito:
 *   1. la rama `puente-token-plataforma` de `decidirAcceso()`,
 *   2. la cabecera `X-Pulso-Admin` del cliente (`lib/api-admin.ts`),
 *   3. este parrafo.
 *
 * Se deja escrito aqui para que quien haga 1.3 no tenga que adivinarlo.
 *
 * Logica pura: recibe hechos, devuelve una decision. Sin Nest, sin `req`.
 */

/** El rol que administra la plataforma. Uno de los siete de multitenancy §2.1. */
export const ROL_ADMIN_PLATAFORMA = 'admin_plataforma';

/**
 * Lo que se sabe de quien llama. Espeja `Carga` de `auth/sesion.service.ts`
 * mas los campos que 1.3 va a agregar, TODOS opcionales — leerlos de forma
 * defensiva es lo que permite que esto empiece a funcionar solo.
 */
export interface CargaSesion {
  sub: string;
  tip?: 'humano' | 'servicio';
  /** [1.3] Los roles del actor. Hoy siempre ausente. */
  roles?: unknown;
}

export interface HechosAcceso {
  /** Lo que devolvio `SesionService.verificar()`. null = sin sesion valida. */
  carga: CargaSesion | null;
  /** ¿Hay `PULSO_ADMIN_TOKEN` configurado? Si no, el puente no existe. */
  plataformaConfigurada: boolean;
  /** ¿Llego la cabecera `X-Pulso-Admin`? Distingue "no intento" de "intento mal". */
  tokenPlataformaPresente: boolean;
  /** ¿Y coincide? Lo calcula el guard con `verificarAdminPlataforma()`. */
  tokenPlataformaValido: boolean;
}

export type ViaAcceso = 'rol' | 'puente-token-plataforma';

export type MotivoNegacion =
  | 'sin-sesion'
  /** Tiene roles y ninguno es admin_plataforma. El 403 del checklist. */
  | 'sin-rol-admin'
  /** Un token de servicio (`svc:voz`). Un bot no administra logica clinica. */
  | 'identidad-de-servicio'
  /** No hay `PULSO_ADMIN_TOKEN`: la puerta no existe, no es que este cerrada. */
  | 'plataforma-sin-credencial'
  /** Falta la cabecera del puente. */
  | 'sin-credencial-de-plataforma'
  /** Llego la cabecera y no coincide. */
  | 'credencial-de-plataforma-invalida';

export type Acceso =
  | { permitido: true; actor: string; via: ViaAcceso }
  | { permitido: false; motivo: MotivoNegacion; mensaje: string };

export const MENSAJE_NEGACION: Record<MotivoNegacion, string> = {
  'sin-sesion': 'Sesión requerida.',
  'sin-rol-admin':
    'Esta consola es solo para admin_plataforma. Tu rol no administra catálogos ni modelos.',
  'identidad-de-servicio':
    'Un token de servicio no administra lógica clínica. Esto lo firma una persona.',
  'plataforma-sin-credencial':
    'La administración de plataforma está deshabilitada: falta PULSO_ADMIN_TOKEN en core. ' +
    'No hay credencial por defecto a propósito.',
  'sin-credencial-de-plataforma':
    'Falta la credencial de plataforma. Mientras core no emita roles (tarea 1.3), ' +
    'esta consola exige la cabecera X-Pulso-Admin.',
  'credencial-de-plataforma-invalida': 'La credencial de plataforma no es válida.',
};

/**
 * ¿Puede quien llama administrar la plataforma?
 *
 * Orden deliberado. Cada paso cierra una puerta antes de abrir la siguiente.
 */
export function decidirAcceso(hechos: HechosAcceso): Acceso {
  const { carga } = hechos;

  // 1. Sin sesion no hay nada que evaluar. El guard global ya deberia haber
  //    devuelto 401; esto es cinturon ademas de tirantes.
  if (!carga) return negar('sin-sesion');

  // 2. Un token de servicio JAMAS administra. `voz` puede crear un caso; no
  //    puede cambiar que servicios exige un infarto. Es la regla 6 del repo:
  //    nada con consecuencia clinica ocurre sin confirmacion humana.
  if (carga.tip === 'servicio' || carga.sub.startsWith('svc:')) {
    return negar('identidad-de-servicio');
  }

  // 3. [1.3] IDENTIDAD REAL. Si el token trae roles, los roles deciden y no
  //    hay apelacion: un `admin_organizacion` recibe 403 aunque tenga la
  //    credencial de plataforma en el bolsillo. Lo contrario convertiria una
  //    variable de entorno compartida en una escalada de privilegios.
  const roles = leerRoles(carga.roles);
  if (roles) {
    return roles.includes(ROL_ADMIN_PLATAFORMA)
      ? { permitido: true, actor: carga.sub, via: 'rol' }
      : negar('sin-rol-admin');
  }

  // 4. PUENTE PROVISIONAL. Core todavia no emite roles. La unica credencial
  //    que hoy prueba "soy plataforma" es PULSO_ADMIN_TOKEN — la misma que ya
  //    gobierna la emision de tokens de servicio. No se inventa una segunda.
  if (!hechos.plataformaConfigurada) return negar('plataforma-sin-credencial');
  if (!hechos.tokenPlataformaPresente) return negar('sin-credencial-de-plataforma');
  if (!hechos.tokenPlataformaValido) return negar('credencial-de-plataforma-invalida');

  return { permitido: true, actor: carga.sub, via: 'puente-token-plataforma' };
}

/**
 * `null` = el token no trae roles (mundo de hoy). `[]` = los trae vacios, que
 * es una respuesta y significa "ninguno".
 *
 * Se filtra a strings porque el campo llega de un JSON firmado por core pero
 * parseado aqui: un array con un objeto adentro no puede colarse en un
 * `.includes()` y dar sorpresas.
 */
function leerRoles(crudo: unknown): string[] | null {
  if (!Array.isArray(crudo)) return null;
  return crudo.filter((r): r is string => typeof r === 'string');
}

function negar(motivo: MotivoNegacion): Acceso {
  return { permitido: false, motivo, mensaje: MENSAJE_NEGACION[motivo] };
}

/**
 * ¿Core ya sabe de roles? Lo usa `GET /admin/acceso` para que la consola diga
 * en que modo esta en vez de mostrar un 403 mudo. Regla 2 del repo: degrada,
 * y lo dice.
 */
export function identidadReal(carga: CargaSesion | null): boolean {
  return Array.isArray(carga?.roles);
}
