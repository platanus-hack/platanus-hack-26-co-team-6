/**
 * El ÚNICO archivo de core que conoce la URL de ai-core, su formato de cable y
 * su presupuesto de tiempo. Todo lo demás depende de la firma de estos métodos,
 * así que el transporte se puede cambiar sin tocar a ningún llamador.
 *
 * ai-core es interno: el navegador nunca lo ve. Por eso este cliente jamás
 * propaga la URL ni el cuerpo de la respuesta upstream hacia afuera — ese
 * detalle va al log del servidor y nada más.
 */

import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TriageRequest } from '../contracts/types';
import type { AiCoreTriageResponse } from './ai-core.types';

/** Presupuesto por defecto para una llamada de inferencia. */
const TIMEOUT_INFERENCIA_MS = 30_000;

/**
 * Un probe existe para reportar alcanzabilidad rápido. Esperar el presupuesto
 * completo de inferencia para enterarse de que el puerto está cerrado es
 * inútil. No es variable de entorno: no cambia por ambiente.
 */
const TIMEOUT_PROBE_MS = 2_000;

@Injectable()
export class AiCoreClient {
  private readonly log = new Logger(AiCoreClient.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * false = no hay `AI_CORE_BASE_URL` y core resuelve todo localmente.
   * Arrancar sin ai-core es un modo de operación válido, no un error.
   */
  configurado(): boolean {
    return Boolean(this.baseUrl());
  }

  /** Reachability. Lo usa `GET /health/ai-core`. */
  async salud(): Promise<{ status: string; service: string }> {
    return this.pedir('/health', undefined, TIMEOUT_PROBE_MS);
  }

  /** Dictado → entidades clínicas, extraídas por ai-core. */
  async triage(cuerpo: TriageRequest): Promise<AiCoreTriageResponse> {
    return this.pedir('/v1/triage', cuerpo, this.timeoutInferencia());
  }

  /**
   * Audio grabado → texto.
   *
   * Es el camino del dictado para los navegadores SIN Web Speech API, que no
   * son un caso raro: Firefox no la trae y Safari/iOS tampoco. Ahí el
   * paramédico se quedaba sin dictado y tenía que teclear con el paciente
   * delante.
   *
   * Va en base64 porque es lo que expone `/v1/transcribir` de ai-core. Cuesta
   * un 33% de tamaño sobre el binario; para un dictado de segundos es un
   * peaje aceptable a cambio de no montar multipart entre dos servicios.
   */
  async transcribir(
    audio: Buffer,
    mime: string,
  ): Promise<{ texto: string; proveedor: string; latenciaMs: number }> {
    const r = await this.pedir<{
      texto: string;
      proveedor: string;
      latenciaMs?: number;
      latencia_ms?: number;
    }>(
      '/v1/transcribir',
      { audioBase64: audio.toString('base64'), audioMime: mime },
      this.timeoutInferencia(),
    );
    return {
      texto: r.texto ?? '',
      proveedor: r.proveedor,
      latenciaMs: r.latenciaMs ?? r.latencia_ms ?? 0,
    };
  }

  // ── Transporte ─────────────────────────────────────────────────

  private async pedir<T>(
    ruta: string,
    cuerpo: unknown | undefined,
    timeoutMs: number,
  ): Promise<T> {
    const base = this.baseUrl();
    if (!base) {
      throw new ServiceUnavailableException('ai-core no está configurado');
    }

    let res: Response;
    try {
      res = await fetch(`${base}${ruta}`, {
        method: cuerpo === undefined ? 'GET' : 'POST',
        headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      // AbortSignal.timeout aborta con TimeoutError; lo demás es red caída.
      if (e instanceof Error && e.name === 'TimeoutError') {
        this.log.warn(`ai-core ${ruta} pasó de ${timeoutMs}ms`);
        throw new GatewayTimeoutException('ai-core timed out');
      }
      this.log.warn(`ai-core ${ruta} inalcanzable: ${String(e)}`);
      throw new ServiceUnavailableException('ai-core unavailable');
    }

    if (!res.ok) {
      // El cuerpo upstream va al log, nunca al navegador.
      this.log.warn(`ai-core ${ruta} devolvió ${res.status}: ${await this.textoSeguro(res)}`);
      throw new BadGatewayException('ai-core returned an invalid response');
    }

    try {
      return (await res.json()) as T;
    } catch (e) {
      this.log.warn(`ai-core ${ruta} devolvió algo que no es JSON: ${String(e)}`);
      throw new BadGatewayException('ai-core returned an invalid response');
    }
  }

  private baseUrl(): string | undefined {
    const url = this.config.get<string>('AI_CORE_BASE_URL')?.trim();
    return url ? url.replace(/\/+$/, '') : undefined;
  }

  private timeoutInferencia(): number {
    const crudo = this.config.get<string>('AI_CORE_TIMEOUT_MS');
    const n = Number(crudo);
    return Number.isFinite(n) && n > 0 ? n : TIMEOUT_INFERENCIA_MS;
  }

  private async textoSeguro(res: Response): Promise<string> {
    try {
      return (await res.text()).slice(0, 500);
    } catch {
      return '<sin cuerpo>';
    }
  }
}
