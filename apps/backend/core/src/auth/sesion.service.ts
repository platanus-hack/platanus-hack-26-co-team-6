/**
 * Sesión de operador y credencial de servicio.
 *
 * PULSO expone dictado clínico crudo, diagnóstico, edad, sexo y las
 * coordenadas de recogida del paciente. Eso no puede quedar abierto a
 * internet, y el webhook de Telegram obliga a exponer core por HTTPS. De ahí
 * este módulo.
 *
 * MODELO: una contraseña compartida para todo el turno. No hay usuarios
 * individuales porque no hay a quién distinguir: las tres consolas
 * (/campo, /hospital, /crue) las opera el mismo equipo. Cuando haya que
 * atribuir una decisión a una sede concreta, esto se cambia por identidad por
 * sede — el guard ya está en el sitio correcto para hacerlo (tarea 1.3).
 *
 * DOS CLASES DE TOKEN, MISMA FIRMA:
 *   - humano   (`tip:'humano'`, 12 h)  → lo emite POST /auth/login
 *   - servicio (`tip:'servicio'`, 24 h) → lo emite POST /auth/servicio, lleva
 *     `sub: 'svc:<nombre>'` y una lista de alcances que el guard hace cumplir.
 *     Ver token-servicio.ts: es lo que impide que `voz` acepte un traslado.
 *
 * El token es stateless y firmado (HMAC-SHA256): no hay tabla de sesiones que
 * se pierda al reiniciar, igual que AlmacenService.
 *
 * ── SIN CONFIGURAR ─────────────────────────────────────────────────
 * A diferencia del resto del repo, esto NO cae a un modo mock permisivo:
 * un fallback abierto aquí ES la vulnerabilidad. Si faltan las variables,
 * genera credenciales aleatorias y las imprime en el arranque. El sistema
 * sigue usable en local sin .env, pero nunca queda sin autenticar. Y la
 * emisión de tokens de servicio, que es una operación de plataforma, queda
 * DESHABILITADA sin PULSO_ADMIN_TOKEN — ahí no hay credencial generada que
 * valga: nadie emite identidades nuevas por accidente.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import {
  ALCANCES,
  esAlcance,
  NOMBRE_SERVICIO,
  PREFIJO_SERVICIO,
  type Alcance,
} from './token-servicio';

/** Un turno largo cabe de sobra. Más allá, que vuelva a entrar. */
const DURACION_MS = 12 * 60 * 60 * 1000;

/**
 * 24 h para un servicio. Es lo que dice docs/multitenancy-y-autenticacion.md
 * §3.1 y no es un número redondo por casualidad: el token vive en una variable
 * de entorno de Render, y renovarlo es un despliegue. Más corto obligaría a
 * automatizar la rotación antes de que exista quien la automatice.
 */
const DURACION_SERVICIO_MS = 24 * 60 * 60 * 1000;

/** Horas que se sigue aceptando el secreto anterior tras rotar. Ver §rotación. */
const GRACIA_HORAS_DEFECTO = 24;

export const COOKIE_SESION = 'pulso_sesion';

/**
 * Saca el token de las cabeceras: `Authorization: Bearer` (curl, scripts) o la
 * cookie (el navegador). Vive aquí y no en el guard porque el controlador de
 * /auth/sesion necesita exactamente lo mismo, y dos parsers de cookie que se
 * desincronizan es justo el tipo de bug que abre una puerta.
 *
 * A mano y no con cookie-parser: sería una dependencia entera para esto.
 */
export function tokenDeCabeceras(cabeceras: {
  authorization?: string;
  cookie?: string;
}): string | undefined {
  const auth = cabeceras.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();

  if (!cabeceras.cookie) return undefined;
  for (const parte of cabeceras.cookie.split(';')) {
    const sep = parte.indexOf('=');
    if (sep <= 0) continue;
    if (parte.slice(0, sep).trim() === COOKIE_SESION) {
      return decodeURIComponent(parte.slice(sep + 1).trim());
    }
  }
  return undefined;
}

export interface Carga {
  sub: string;
  exp: number;
  /**
   * Ausente en los tokens emitidos antes de la tarea 1.8. Se trata como
   * humano: si un token viejo pasara a ser 'servicio' por omisión, un
   * despliegue lo dejaría sin alcance y tumbaría las consolas en caliente.
   */
  tip?: 'humano' | 'servicio';
  /** Solo en tokens de servicio. El guard exige que la ruta esté aquí. */
  alc?: Alcance[];
}

@Injectable()
export class SesionService implements OnModuleInit {
  private readonly log = new Logger(SesionService.name);

  private secreto: Buffer = randomBytes(32);
  /**
   * Secreto anterior, solo para VERIFICAR. Nunca se firma con él: la ventana de
   * gracia deja entrar lo ya emitido, no permite emitir con lo viejo.
   */
  private secretoAnterior: Buffer | null = null;
  /** Epoch ms hasta el que se acepta `secretoAnterior`. */
  private graciaHasta = 0;
  private avisoGracia = false;

  /** sha256 de la contraseña. Comparamos digests para no filtrar longitud. */
  private passwordDigest: Buffer = randomBytes(32);

  /**
   * sha256 de PULSO_ADMIN_TOKEN, o null si no está configurado. `null` no es
   * "cualquiera pasa": es "nadie pasa". Ver verificarAdminPlataforma().
   */
  private adminDigest: Buffer | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const secreto = this.config.get<string>('SESION_SECRET');
    if (secreto && secreto.length >= 16) {
      this.secreto = Buffer.from(secreto, 'utf8');
    } else {
      // Aleatorio en memoria: las sesiones no sobreviven al reinicio. Molesto
      // en desarrollo, inofensivo. Lo contrario (una constante en el repo)
      // permitiría a cualquiera firmar su propia sesión.
      this.secreto = randomBytes(32);
      this.log.warn(
        'SESION_SECRET no configurado (o muy corto): usando uno aleatorio. ' +
          'Las sesiones se invalidan en cada reinicio.',
      );
    }

    this.configurarGracia();

    const password = this.config.get<string>('OPERADOR_PASSWORD');
    if (password) {
      this.passwordDigest = sha256(password);
    } else {
      const generada = randomBytes(9).toString('base64url');
      this.passwordDigest = sha256(generada);
      this.log.warn(
        `\n──────── [PULSO · contraseña de operador generada] ────────\n` +
          `  ${generada}\n` +
          `Cambia en cada reinicio. Fíjala en OPERADOR_PASSWORD.\n` +
          `───────────────────────────────────────────────────────────`,
      );
    }

    const admin = this.config.get<string>('PULSO_ADMIN_TOKEN');
    if (admin && admin.length >= 16) {
      this.adminDigest = sha256(admin);
    } else {
      // Aquí NO se genera una credencial aleatoria como con la contraseña de
      // operador: emitir un token de servicio crea una identidad con alcance
      // sobre datos clínicos. Sin credencial explícita, la puerta no existe.
      this.adminDigest = null;
      this.log.warn(
        'PULSO_ADMIN_TOKEN no configurado: POST /auth/servicio queda ' +
          'deshabilitado. Sin él no se pueden emitir tokens de servicio.',
      );
    }
  }

  /**
   * ── ROTACIÓN SIN CAÍDA ──────────────────────────────────────────
   * El token de servicio vive 24 h en una variable de entorno de Render.
   * Rotar SESION_SECRET invalidaría de golpe todos los tokens vivos: `voz`
   * empezaría a comerse 401 hasta que alguien redesplegara con un token nuevo,
   * y eso son minutos con los webhooks de WhatsApp cayendo al piso.
   *
   * Por eso el secreto viejo se pasa a SESION_SECRET_ANTERIOR (alias
   * PULSO_SECRETO_ANTERIOR) y se sigue ACEPTANDO durante una ventana. Como el
   * diseño es stateless y no hay dónde anotar "cuándo se rotó", la ventana se
   * ancla al arranque del proceso — que es exactamente el despliegue que hizo
   * la rotación. 24 h por defecto = la vida de un token de servicio: pasado
   * eso, no queda ninguno firmado con el viejo.
   *
   * Se firma SIEMPRE con el nuevo. Terminada la ventana, borrar la variable.
   */
  private configurarGracia(): void {
    const anterior =
      this.config.get<string>('SESION_SECRET_ANTERIOR') ??
      this.config.get<string>('PULSO_SECRETO_ANTERIOR');
    if (!anterior || anterior.length < 16) {
      this.secretoAnterior = null;
      this.graciaHasta = 0;
      return;
    }

    const horas =
      Number(this.config.get<string>('PULSO_SECRETO_ANTERIOR_HORAS')) ||
      GRACIA_HORAS_DEFECTO;
    this.secretoAnterior = Buffer.from(anterior, 'utf8');
    this.graciaHasta = Date.now() + horas * 60 * 60 * 1000;
    this.log.warn(
      `Ventana de gracia de rotación activa: se acepta el secreto anterior ` +
        `${horas} h más (hasta ${new Date(this.graciaHasta).toISOString()}). ` +
        `Quita SESION_SECRET_ANTERIOR cuando pase.`,
    );
  }

  /** true si la contraseña coincide. Comparación en tiempo constante. */
  verificarPassword(password: string): boolean {
    return igual(sha256(password ?? ''), this.passwordDigest);
  }

  /**
   * La credencial de plataforma que abre POST /auth/servicio.
   *
   * Hoy es una variable de entorno dedicada y no un rol, porque el rol
   * `admin_plataforma` todavía no existe: la identidad real es la tarea 1.3.
   * Cuando aterrice, esto se reemplaza por `@Rol('admin_plataforma')` en el
   * controlador y este método se borra — la firma está pensada para eso.
   *
   * Sin configurar devuelve false SIEMPRE. Es la excepción a la regla de
   * degradación del repo: en autenticación, un fallback abierto es la falla.
   */
  verificarAdminPlataforma(token: string | undefined): boolean {
    if (!this.adminDigest || !token) return false;
    return igual(sha256(token), this.adminDigest);
  }

  /** Si POST /auth/servicio está habilitado. Lo reporta el 403 y /capacidades. */
  emisionDeServicioHabilitada(): boolean {
    return this.adminDigest !== null;
  }

  /** Token firmado `<carga>.<firma>`, ambos base64url. */
  emitir(sub = 'operador'): { token: string; expiraEn: number } {
    if (sub.startsWith(PREFIJO_SERVICIO)) {
      // Un token humano con `sub: 'svc:...'` ensuciaría la auditoría en la
      // única dirección que importa: haría pasar a una persona por un bot.
      throw new Error(`emitir() no emite identidades de servicio: ${sub}`);
    }
    return this.firmarCarga({ sub, tip: 'humano' }, DURACION_MS);
  }

  /**
   * Token de servicio: 24 h, `sub: 'svc:<nombre>'` y alcance cerrado.
   *
   * Valida el nombre y cada alcance contra la lista conocida. Un alcance con
   * un typo (`'caso:crea'`) no puede quedar en un token: sería un permiso que
   * nadie concede y nadie niega, y el 403 aparecería en producción a las 3 am.
   */
  emitirServicio(
    nombre: string,
    alcance: readonly Alcance[],
  ): { token: string; expiraEn: number; sub: string; alcance: Alcance[] } {
    if (!NOMBRE_SERVICIO.test(nombre)) {
      throw new Error(
        `nombre de servicio inválido: "${nombre}". Minúsculas, dígitos y guiones.`,
      );
    }
    const alc: Alcance[] = [...(alcance ?? [])];
    if (alc.length === 0) {
      throw new Error('un token de servicio sin alcance no sirve para nada');
    }
    const desconocido = alc.find((a) => !esAlcance(a));
    if (desconocido !== undefined) {
      throw new Error(
        `alcance desconocido: "${String(desconocido)}". Conocidos: ${ALCANCES.join(', ')}`,
      );
    }

    const sub = `${PREFIJO_SERVICIO}${nombre}`;
    const { token, expiraEn } = this.firmarCarga(
      { sub, tip: 'servicio', alc },
      DURACION_SERVICIO_MS,
    );
    return { token, expiraEn, sub, alcance: alc };
  }

  /** La carga si el token es válido y no expiró; null en cualquier otro caso. */
  verificar(token: string | undefined): Carga | null {
    if (!token) return null;

    const corte = token.lastIndexOf('.');
    if (corte <= 0) return null;

    const carga = token.slice(0, corte);
    const firma = token.slice(corte + 1);

    // Firma primero: sin esto estaríamos parseando JSON de un desconocido.
    if (!this.firmaValida(carga, firma)) return null;

    try {
      const datos: unknown = JSON.parse(
        Buffer.from(carga, 'base64url').toString('utf8'),
      );
      return aCarga(datos);
    } catch {
      return null;
    }
  }

  /** Duración de la cookie, en ms. La usa el controlador al ponerla. */
  duracionMs(): number {
    return DURACION_MS;
  }

  /** Duración de un token de servicio, en ms. */
  duracionServicioMs(): number {
    return DURACION_SERVICIO_MS;
  }

  private firmarCarga(
    datos: Omit<Carga, 'exp'>,
    duracion: number,
  ): { token: string; expiraEn: number } {
    const exp = Date.now() + duracion;
    const carga = Buffer.from(JSON.stringify({ ...datos, exp })).toString(
      'base64url',
    );
    return { token: `${carga}.${this.firmar(carga)}`, expiraEn: exp };
  }

  /** Vale la firma con el secreto vigente, o con el anterior si hay ventana. */
  private firmaValida(carga: string, firma: string): boolean {
    const esperada = Buffer.from(firma);
    if (igual(esperada, Buffer.from(this.firmar(carga)))) return true;

    if (!this.secretoAnterior || Date.now() > this.graciaHasta) return false;
    const conAnterior = createHmac('sha256', this.secretoAnterior)
      .update(carga)
      .digest('base64url');
    if (!igual(esperada, Buffer.from(conAnterior))) return false;

    if (!this.avisoGracia) {
      // Una sola vez por proceso: en caliente esto pasa en cada request y el
      // log dejaría de servir para nada.
      this.avisoGracia = true;
      this.log.warn(
        'Hay tokens vivos firmados con el secreto ANTERIOR. Siguen entrando ' +
          `hasta ${new Date(this.graciaHasta).toISOString()}. Renuévalos.`,
      );
    }
    return true;
  }

  private firmar(carga: string): string {
    return createHmac('sha256', this.secreto).update(carga).digest('base64url');
  }
}

/**
 * Valida la forma de la carga antes de devolverla. La firma ya se comprobó,
 * pero un token bien firmado con basura adentro solo puede venir de un bug
 * nuestro — y es mejor que muera aquí que ruta por ruta con un 403 mudo.
 */
function aCarga(datos: unknown): Carga | null {
  if (typeof datos !== 'object' || datos === null) return null;
  const d = datos as Record<string, unknown>;

  if (typeof d.sub !== 'string' || !d.sub) return null;
  if (typeof d.exp !== 'number' || d.exp < Date.now()) return null;

  // Sin `tip` es un token de antes de la tarea 1.8: humano, y sin alcance.
  if (d.tip !== 'servicio') return { sub: d.sub, exp: d.exp, tip: 'humano' };

  const alc: unknown = d.alc;
  if (!Array.isArray(alc)) return null;
  const lista = alc as unknown[];
  if (!lista.every(esAlcance)) return null;

  return { sub: d.sub, exp: d.exp, tip: 'servicio', alc: lista };
}

function sha256(valor: string): Buffer {
  return createHash('sha256').update(valor, 'utf8').digest();
}

/** timingSafeEqual revienta si las longitudes difieren; esto no. */
function igual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
