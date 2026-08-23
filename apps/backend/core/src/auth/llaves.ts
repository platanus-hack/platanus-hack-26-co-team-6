/**
 * Llaves de API con alcance — tarea 5.9.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  PARA QUE
 * ═══════════════════════════════════════════════════════════════════
 *  El HIS de un hospital consume PULSO sin una persona delante. Hoy la
 *  unica forma de hablarle a core es la contraseña de turno, que **puede
 *  todo**: crear casos, aceptar traslados, declarar capacidad. Darle eso a
 *  una integracion es darle a un sistema ajeno el boton de aceptar
 *  pacientes.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  EL PREFIJO NO ES COSMETICO
 * ═══════════════════════════════════════════════════════════════════
 *  `pulso_sk_` permite que los escaneres de secretos —GitHub, gitleaks—
 *  detecten la llave si alguien la commitea. Es una cortesia al integrador
 *  que cuesta cero y evita el peor final: una llave viva en un repositorio
 *  publico que nadie mira.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  POR QUE sha256 AQUI Y ARGON2ID EN LAS CONTRASEÑAS
 * ═══════════════════════════════════════════════════════════════════
 *  No es una inconsistencia. Argon2id/scrypt existen para hacer LENTO el
 *  ataque por diccionario contra secretos de baja entropia —los que elige
 *  una persona—. Una llave de 32 bytes aleatorios no tiene diccionario que
 *  la contenga: nadie la adivina, y hashearla con una KDF lenta solo
 *  serviria para que cada peticion del HIS cueste 50 ms de CPU.
 *
 *  Lo que si importa aqui es que **el valor no se guarda nunca** y que la
 *  comparacion sea en tiempo constante.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

/** Ver la cabecera: lo detectan los escaneres de secretos. */
export const PREFIJO = 'pulso_sk_';

/**
 * Alcances posibles. **Minimo por defecto**: una llave nueva sin alcance
 * explicito no puede hacer nada, y eso es lo correcto — el error de tener
 * que ampliarla se ve enseguida; el de haberla creado con todo, no.
 *
 * Ninguno dice "borrar". El sistema no borra: transiciona y agrega eventos.
 */
export const ALCANCES = [
  'caso:leer',
  'caso:crear',
  'capacidad:declarar',
  'webhook:administrar',
] as const;

export type Alcance = (typeof ALCANCES)[number];

export const esAlcance = (valor: unknown): valor is Alcance =>
  typeof valor === 'string' && (ALCANCES as readonly string[]).includes(valor);

/** Ventana de gracia de una rotacion: la llave vieja sigue sirviendo 24 h. */
export const GRACIA_MS = 24 * 60 * 60 * 1000;

export interface LlaveApi {
  id: string;
  organizacionId: string;
  etiqueta: string;
  alcances: Alcance[];
  /** sha256 del valor. El valor NO se guarda en ningun sitio. */
  hash: string;
  /** Para poder mostrar `pulso_sk_…a1b2` en la tabla sin guardar el secreto. */
  ultimos4: string;
  creadaEn: string;
  creadaPor: string;
  revocadaEn: string | null;
  /**
   * Cuando deja de servir. Solo lo pone una rotacion: la llave vieja aguanta
   * 24 h para que el integrador migre sin que se le caiga el servicio a las
   * 3 de la mañana por un cambio que hicimos nosotros.
   */
  expiraEn: number | null;
  /** Uso: lo que permite notar una llave filtrada. */
  ultimoUsoEn: string | null;
  ultimaIp: string | null;
  usos: number;
}

/** Lo que se devuelve al crearla — la UNICA vez que existe el valor. */
export interface LlaveCreada {
  llave: LlaveApi;
  /** Se muestra una sola vez. No se puede volver a ver, solo rotar. */
  valor: string;
}

export type ResultadoVerificacion =
  | { valida: true; llave: LlaveApi }
  | { valida: false; motivo: 'desconocida' | 'revocada' | 'expirada' };

@Injectable()
export class LlavesService {
  private readonly log = new Logger(LlavesService.name);

  /**
   * ⚠️ En memoria, como el resto de la identidad hasta la tarea 1.2. Cuando
   *    exista la tabla, esta clase cambia por dentro y nada mas se entera:
   *    ninguna ruta toca el Map directamente.
   *
   *    Consecuencia hoy: reiniciar core invalida todas las llaves. Es el
   *    lado seguro del fallo — una llave que sobrevive a lo que no deberia
   *    es peor que una que hay que volver a emitir.
   */
  private readonly llaves = new Map<string, LlaveApi>();
  /** hash → id. Verificar es una busqueda directa, no un recorrido. */
  private readonly porHash = new Map<string, string>();

  crear(entrada: {
    organizacionId: string;
    etiqueta: string;
    alcances: Alcance[];
    creadaPor: string;
  }): LlaveCreada {
    const valor = `${PREFIJO}${randomBytes(32).toString('base64url')}`;
    const hash = hashear(valor);

    const llave: LlaveApi = {
      id: randomUUID(),
      organizacionId: entrada.organizacionId,
      etiqueta: entrada.etiqueta,
      // Minimo por defecto: sin alcances explicitos, la llave no hace nada.
      alcances: entrada.alcances.filter(esAlcance),
      hash,
      ultimos4: valor.slice(-4),
      creadaEn: new Date().toISOString(),
      creadaPor: entrada.creadaPor,
      revocadaEn: null,
      expiraEn: null,
      ultimoUsoEn: null,
      ultimaIp: null,
      usos: 0,
    };

    this.llaves.set(llave.id, llave);
    this.porHash.set(hash, llave.id);
    this.log.log(
      `llave ${llave.id} creada para ${llave.organizacionId} ` +
        `con alcances [${llave.alcances.join(', ')}]`,
    );
    return { llave, valor };
  }

  /**
   * Rotacion con ventana de gracia.
   *
   * La vieja NO se revoca: se le pone fecha de vencimiento a 24 h. Revocarla
   * en el acto tumba la integracion del cliente en el instante en que
   * apretamos un boton nosotros, y eso convierte una buena practica —rotar
   * llaves— en algo que nadie quiere hacer.
   */
  rotar(id: string, actorId: string): LlaveCreada | null {
    const vieja = this.llaves.get(id);
    if (!vieja || vieja.revocadaEn) return null;

    vieja.expiraEn = Date.now() + GRACIA_MS;

    const nueva = this.crear({
      organizacionId: vieja.organizacionId,
      etiqueta: vieja.etiqueta,
      alcances: vieja.alcances,
      creadaPor: actorId,
    });

    this.log.warn(
      `llave ${id} rotada: sigue valida ${GRACIA_MS / 3_600_000} h mas`,
    );
    return nueva;
  }

  /** Revocacion inmediata. Sin gracia: es lo que se hace con una filtrada. */
  revocar(id: string): boolean {
    const llave = this.llaves.get(id);
    if (!llave || llave.revocadaEn) return false;
    llave.revocadaEn = new Date().toISOString();
    this.log.warn(`llave ${id} revocada`);
    return true;
  }

  /**
   * ⭐ El camino caliente: una peticion del HIS con `Authorization: Bearer`.
   *
   * Registra el uso siempre que la llave exista, incluso si esta revocada:
   * **un intento con una llave revocada es justo la señal que interesa** —
   * significa que alguien todavia la tiene.
   */
  verificar(valor: string, ip?: string): ResultadoVerificacion {
    const id = this.porHash.get(hashear(valor));
    if (!id) return { valida: false, motivo: 'desconocida' };

    const llave = this.llaves.get(id)!;

    // Comparacion en tiempo constante aunque ya hayamos acertado el hash: el
    // Map es una optimizacion, esta es la comprobacion.
    if (!igual(hashear(valor), llave.hash))
      return { valida: false, motivo: 'desconocida' };

    if (llave.revocadaEn) {
      this.log.warn(
        `intento con la llave revocada ${llave.id} desde ${ip ?? '?'}`,
      );
      return { valida: false, motivo: 'revocada' };
    }
    if (llave.expiraEn && llave.expiraEn <= Date.now())
      return { valida: false, motivo: 'expirada' };

    llave.usos += 1;
    llave.ultimoUsoEn = new Date().toISOString();
    llave.ultimaIp = ip ?? null;
    return { valida: true, llave };
  }

  /** Las de una organizacion. Nunca incluye el valor: no existe guardado. */
  listar(organizacionId: string): LlaveApi[] {
    return [...this.llaves.values()]
      .filter((l) => l.organizacionId === organizacionId)
      .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
  }

  porId(id: string): LlaveApi | undefined {
    return this.llaves.get(id);
  }
}

const hashear = (valor: string): string =>
  createHash('sha256').update(valor, 'utf8').digest('hex');

function igual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
