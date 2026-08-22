/**
 * Transcripción de voz de servidor (Deepgram).
 *
 * ── POR QUÉ EXISTE, SI YA HAY DICTADO ─────────────────────────────
 * /campo dicta hoy con la Web Speech API del navegador. Es gratis y funciona,
 * pero tiene un límite que no se puede programar alrededor: **no existe en
 * Safari/iOS**, y una parte de las ambulancias del país usa iPhone. Ahí el
 * dictado no está degradado, está ausente, y el paramédico cae al teclado
 * justo en el momento en que tiene las manos ocupadas.
 *
 * Deepgram cubre ese hueco: corre por WebSocket desde cualquier navegador,
 * entiende español colombiano mejor que el reconocedor del sistema y no se
 * corta sola a los pocos segundos de silencio.
 *
 * ── DOS CAMINOS, Y POR QUÉ HAY DOS ────────────────────────────────
 * La API key maestra NO puede llegar al navegador: cualquiera con el bundle
 * abierto se la lleva y la gasta. Así que hay dos formas de transcribir sin
 * entregarla, y core soporta las dos porque no todas las keys sirven para la
 * primera:
 *
 *  1. STREAMING (POST /voz/token). core cambia su key por un token de vida
 *     corta (`/v1/auth/grant`) y el navegador abre el WebSocket contra
 *     Deepgram con ESE. Transcripción palabra por palabra mientras se habla.
 *     Requiere una key con permiso para crear credenciales — una key de
 *     miembro devuelve 403 aquí.
 *
 *  2. PROXY (POST /voz/transcribir). El navegador graba y manda el audio a
 *     core, y core lo transcribe contra Deepgram. La key tampoco sale, y
 *     funciona con CUALQUIER key válida.
 *
 * Para el dictado clínico de /campo el camino 2 no es un consuelo: es
 * probablemente el mejor. El flujo del módulo es "dicte → lea lo que se
 * entendió → regrabe o agregue", no subtitulado en vivo, y el modelo
 * pre-grabado puntúa mejor y acierta más que el de streaming. Además es el
 * único de los dos que sobrevive a una zona muerta: el audio se guarda local
 * y se manda cuando vuelve la señal.
 *
 * Sin DEEPGRAM_API_KEY este servicio dice que no está disponible y /campo
 * sigue con la Web Speech API. La regla del repo se mantiene: sin
 * credenciales, se degrada; no se rompe.
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Capacidades, TokenVozResponse } from '../contracts/types';

/**
 * Vida del token. Cinco minutos: sobra para arrancar un dictado y es corto
 * para que un token filtrado no sirva de nada. La sesión de STT ya abierta no
 * se corta cuando vence — Deepgram valida al conectar, no en cada paquete.
 */
const TTL_S = 300;

/**
 * nova-2 y no nova-3: al 2026-08 nova-3 sirve español por la vía multilingüe
 * y nova-2 tiene modelo dedicado de español latinoamericano, que es lo que
 * habla un paramédico en Bogotá. Si Deepgram cambia esto, se ajusta por env
 * sin tocar código.
 */
const MODELO = 'nova-2';
const IDIOMA = 'es-419';

/** Tope del audio que se acepta por dictado. Ver voz.controller.ts. */
export const MAX_AUDIO_MB = 15;

interface RespuestaGrant {
  access_token?: string;
  expires_in?: number;
  err_msg?: string;
}

interface RespuestaListen {
  results?: {
    channels?: {
      alternatives?: { transcript?: string; confidence?: number }[];
    }[];
  };
  err_msg?: string;
}

@Injectable()
export class VozService {
  private readonly log = new Logger(VozService.name);

  constructor(private readonly config: ConfigService) {}

  private key(): string | undefined {
    return this.config.get<string>('DEEPGRAM_API_KEY');
  }

  /** Lo consume CapacidadesService para la barra persistente de /campo. */
  disponible(): boolean {
    return Boolean(this.key());
  }

  /**
   * Cuál de los dos caminos está realmente disponible.
   *
   * Se averigua PROBANDO, no leyendo configuración: que exista la key no
   * implica que pueda emitir credenciales. Una key de miembro transcribe
   * perfectamente y devuelve 403 en `/v1/auth/grant`, y la diferencia solo se
   * ve pidiéndolo.
   *
   * El resultado se cachea porque los permisos de una key no cambian mientras
   * el proceso vive. El precio: si alguien amplía los permisos en la consola
   * de Deepgram, hay que reiniciar core para que lo note. A cambio, la barra
   * de /campo no dispara una llamada a Deepgram en cada refresco.
   */
  private modoCache: Capacidades['voz'] | null = null;

  async modo(): Promise<Capacidades['voz']> {
    if (!this.key()) return 'navegador';
    if (this.modoCache) return this.modoCache;

    try {
      await this.tokenEfimero();
      this.modoCache = 'deepgram-streaming';
    } catch {
      this.log.warn(
        'La API key de Deepgram no puede emitir credenciales efímeras ' +
          '(le falta permiso de escritura de keys). Se transcribirá por ' +
          'proxy desde core, que funciona igual para el dictado.',
      );
      this.modoCache = 'deepgram-servidor';
    }
    return this.modoCache;
  }

  modelo(): string {
    return this.config.get<string>('DEEPGRAM_MODELO') ?? MODELO;
  }

  idioma(): string {
    return this.config.get<string>('DEEPGRAM_IDIOMA') ?? IDIOMA;
  }

  /**
   * Cambia la API key maestra por una credencial de vida corta para el
   * navegador.
   *
   * Lanza 503 —y no 500— cuando no hay key o Deepgram falla: no es un error
   * del cliente ni un bug, es una capacidad que no está disponible ahora. El
   * front lo lee así y cae a la Web Speech API sin mostrar un error rojo.
   */
  async tokenEfimero(): Promise<TokenVozResponse> {
    const key = this.key();
    if (!key) {
      throw new ServiceUnavailableException(
        'Transcripción de servidor no configurada (falta DEEPGRAM_API_KEY)',
      );
    }

    let json: RespuestaGrant;
    try {
      const res = await fetch('https://api.deepgram.com/v1/auth/grant', {
        method: 'POST',
        headers: {
          Authorization: `Token ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl_seconds: TTL_S }),
      });
      json = (await res.json()) as RespuestaGrant;

      if (!res.ok || !json.access_token) {
        // El mensaje de Deepgram se loguea pero NO se le devuelve al cliente:
        // puede traer detalles del proyecto y del plan.
        this.log.error(
          `Deepgram rechazó el grant (${res.status}): ${json.err_msg ?? 'sin detalle'}`,
        );
        throw new ServiceUnavailableException(
          'No se pudo obtener credencial de transcripción',
        );
      }
    } catch (e) {
      if (e instanceof ServiceUnavailableException) throw e;
      this.log.error(`Deepgram inalcanzable: ${String(e)}`);
      throw new ServiceUnavailableException(
        'Servicio de transcripción inalcanzable',
      );
    }

    const vidaS = json.expires_in ?? TTL_S;

    return {
      token: json.access_token,
      expiraEn: new Date(Date.now() + vidaS * 1000).toISOString(),
      modelo: this.modelo(),
      idioma: this.idioma(),
    };
  }

  /**
   * Transcribe un audio ya grabado. Es el camino 2 del encabezado.
   *
   * `tipoMime` viene del MediaRecorder del navegador (típicamente
   * `audio/webm;codecs=opus`) y se pasa tal cual: Deepgram detecta el
   * contenedor por el Content-Type y soporta webm, ogg, mp4, wav y mp3 sin
   * conversión de por medio.
   *
   * Devuelve el texto y la confianza del reconocedor. Ojo con no confundir esa
   * confianza con la de la extracción clínica: esta dice "qué tan seguro estoy
   * de haber oído bien", no "qué tan seguro estoy del diagnóstico".
   */
  async transcribir(
    audio: Buffer,
    tipoMime: string,
  ): Promise<{ texto: string; confianza: number; duracionS: number }> {
    const key = this.key();
    if (!key) {
      throw new ServiceUnavailableException(
        'Transcripción de servidor no configurada (falta DEEPGRAM_API_KEY)',
      );
    }
    if (audio.length === 0) {
      throw new BadRequestException('Audio vacío');
    }

    // smart_format pone puntuación y normaliza números — importante aquí: un
    // dictado clínico lleva dosis, edades y horas, y "50 mg" se lee distinto a
    // "cincuenta miligramos" cuando el parser clínico lo procese después.
    const params = new URLSearchParams({
      model: this.modelo(),
      language: this.idioma(),
      smart_format: 'true',
      punctuate: 'true',
    });

    const t0 = Date.now();
    let json: RespuestaListen;
    try {
      const res = await fetch(
        `https://api.deepgram.com/v1/listen?${params.toString()}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${key}`,
            'Content-Type': tipoMime,
          },
          body: new Uint8Array(audio),
        },
      );
      json = (await res.json()) as RespuestaListen;

      if (!res.ok) {
        this.log.error(
          `Deepgram rechazó el audio (${res.status}): ${json.err_msg ?? 'sin detalle'}`,
        );
        throw new ServiceUnavailableException('No se pudo transcribir el audio');
      }
    } catch (e) {
      if (e instanceof ServiceUnavailableException) throw e;
      this.log.error(`Deepgram inalcanzable: ${String(e)}`);
      throw new ServiceUnavailableException(
        'Servicio de transcripción inalcanzable',
      );
    }

    const alt = json.results?.channels?.[0]?.alternatives?.[0];
    const texto = alt?.transcript?.trim() ?? '';

    this.log.log(
      `transcritos ${(audio.length / 1024).toFixed(0)} KB en ${Date.now() - t0}ms · ` +
        `${texto.length} caracteres`,
    );

    return {
      texto,
      confianza: alt?.confidence ?? 0,
      duracionS: (Date.now() - t0) / 1000,
    };
  }
}
