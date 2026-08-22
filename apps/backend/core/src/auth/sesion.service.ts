/**
 * Sesión de operador.
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
 * sede — el guard ya está en el sitio correcto para hacerlo.
 *
 * El token es stateless y firmado (HMAC-SHA256): no hay tabla de sesiones que
 * se pierda al reiniciar, igual que AlmacenService.
 *
 * ── SIN CONFIGURAR ─────────────────────────────────────────────────
 * A diferencia del resto del repo, esto NO cae a un modo mock permisivo:
 * un fallback abierto aquí ES la vulnerabilidad. Si faltan las variables,
 * genera credenciales aleatorias y las imprime en el arranque. El sistema
 * sigue usable en local sin .env, pero nunca queda sin autenticar.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/** Un turno largo cabe de sobra. Más allá, que vuelva a entrar. */
const DURACION_MS = 12 * 60 * 60 * 1000;

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

interface Carga {
  sub: string;
  exp: number;
}

@Injectable()
export class SesionService implements OnModuleInit {
  private readonly log = new Logger(SesionService.name);

  private secreto: Buffer = randomBytes(32);
  /** sha256 de la contraseña. Comparamos digests para no filtrar longitud. */
  private passwordDigest: Buffer = randomBytes(32);

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
  }

  /** true si la contraseña coincide. Comparación en tiempo constante. */
  verificarPassword(password: string): boolean {
    return igual(sha256(password ?? ''), this.passwordDigest);
  }

  /** Token firmado `<carga>.<firma>`, ambos base64url. */
  emitir(sub = 'operador'): { token: string; expiraEn: number } {
    const exp = Date.now() + DURACION_MS;
    const carga = Buffer.from(JSON.stringify({ sub, exp })).toString(
      'base64url',
    );
    return { token: `${carga}.${this.firmar(carga)}`, expiraEn: exp };
  }

  /** La carga si el token es válido y no expiró; null en cualquier otro caso. */
  verificar(token: string | undefined): Carga | null {
    if (!token) return null;

    const corte = token.lastIndexOf('.');
    if (corte <= 0) return null;

    const carga = token.slice(0, corte);
    const firma = token.slice(corte + 1);

    // Firma primero: sin esto estaríamos parseando JSON de un desconocido.
    if (!igual(Buffer.from(firma), Buffer.from(this.firmar(carga)))) {
      return null;
    }

    try {
      const datos = JSON.parse(
        Buffer.from(carga, 'base64url').toString('utf8'),
      ) as Carga;
      if (typeof datos?.exp !== 'number' || datos.exp < Date.now()) return null;
      return datos;
    } catch {
      return null;
    }
  }

  /** Duración de la cookie, en ms. La usa el controlador al ponerla. */
  duracionMs(): number {
    return DURACION_MS;
  }

  private firmar(carga: string): string {
    return createHmac('sha256', this.secreto).update(carga).digest('base64url');
  }
}

function sha256(valor: string): Buffer {
  return createHash('sha256').update(valor, 'utf8').digest();
}

/** timingSafeEqual revienta si las longitudes difieren; esto no. */
function igual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
