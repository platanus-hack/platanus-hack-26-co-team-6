/**
 * Carga el turno de noche sintético en el almacén en memoria.
 *
 * ── POR QUÉ EXISTE ────────────────────────────────────────────────
 * El estado vive en un `Map` en RAM (ver almacen.service.ts) y arranca en
 * cero: las tres consolas abren vacías. Un tablero sin casos no demuestra el
 * ranking, ni el rebote, ni el escalamiento al CRUE — demuestra un formulario.
 * Esto llena las vistas con un turno completo de Bogotá, 19:00 a 07:00.
 *
 * ── APAGADO POR DEFECTO, Y NO ES NEGOCIABLE ───────────────────────
 * Solo carga con `PULSO_DEMO_SINTETICO=true`. La regla 2 del repo dice que
 * todo degrada sin credenciales y lo dice; esto es lo contrario: no es una
 * degradación, son datos falsos. Arrancar producción con 120 pacientes que no
 * existen es peor que arrancar con la pantalla vacía, así que la variable
 * tiene que estar puesta a propósito y el arranque lo grita en el log.
 *
 * ── POR QUÉ NO LEE LOS CSV ────────────────────────────────────────
 * Importa `catalogo-demo.generado.ts`, igual que `sedes/semillas.ts` importa
 * su catálogo. Un `readFileSync` sobre `data/sintetico/` se rompe en cuanto
 * core corre desde `dist/` o dentro del contenedor, y un demo que no arranca
 * es peor que uno vacío. Los CSV son la fuente legible y auditable; este
 * módulo consume su compilado.
 *
 * ── LO QUE NO CARGA ───────────────────────────────────────────────
 * `AlmacenService` guarda casos, handshakes, escalamientos e historial de
 * aceptación: eso es lo que entra. Los móviles, las posiciones, los mensajes,
 * las camas y los actores viven en `data/sintetico/*.csv` y en el seed de
 * Supabase, porque hoy no hay dónde ponerlos en memoria. Cargarlos exigiría
 * inventar almacenes nuevos, y eso ya es lógica de negocio.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlmacenService } from '../almacen/almacen.service';
import {
  CASOS_DEMO,
  ESCALAMIENTOS_DEMO,
  HANDSHAKES_DEMO,
} from './catalogo-demo.generado';

export const BANDERA_DEMO = 'PULSO_DEMO_SINTETICO';

@Injectable()
export class SemillasDemoService implements OnModuleInit {
  private readonly log = new Logger('SemillasDemo');
  private cargado = false;

  constructor(
    private readonly config: ConfigService,
    private readonly almacen: AlmacenService,
  ) {}

  /** true solo si la bandera está puesta explícitamente en 'true'. */
  activo(): boolean {
    return this.config.get<string>(BANDERA_DEMO) === 'true';
  }

  onModuleInit(): void {
    if (!this.activo()) return;
    this.cargar();
  }

  cargar(): void {
    if (this.cargado) return;

    for (const caso of CASOS_DEMO) this.almacen.guardarCaso(caso);
    for (const h of HANDSHAKES_DEMO) {
      this.almacen.guardarHandshake(h);
      // El historial de aceptación es el prior de P(aceptación) del ranking.
      // Sin rehidratarlo, 205 respuestas de hospital quedarían de adorno y el
      // scoring seguiría creyendo que nadie ha rechazado nunca — que es
      // justamente lo que el demo quiere mostrar que no pasa.
      if (h.estado === 'aceptado' || h.estado === 'rechazado') {
        this.almacen.registrarRespuesta(h.sedeCodigo, h.estado, h.latenciaS);
      }
    }
    for (const e of ESCALAMIENTOS_DEMO) this.almacen.guardarEscalamiento(e);

    this.cargado = true;

    // Que se vea en la primera pantalla de log: quien arranque esto tiene que
    // saber, sin buscarlo, que lo que va a ver no son datos de verdad.
    this.log.warn(
      `⚠️  DATOS SINTETICOS CARGADOS (${BANDERA_DEMO}=true) — ` +
        `${CASOS_DEMO.length} casos, ${HANDSHAKES_DEMO.length} handshakes, ` +
        `${ESCALAMIENTOS_DEMO.length} escalamientos. ` +
        'Ningun paciente de este turno existe. Ver data/sintetico/README.md.',
    );
  }

  /** Lo que reporta GET /demo-sintetico. Sin PII: solo conteos. */
  resumen() {
    return {
      activo: this.activo(),
      cargado: this.cargado,
      casos: this.cargado ? CASOS_DEMO.length : 0,
      handshakes: this.cargado ? HANDSHAKES_DEMO.length : 0,
      escalamientos: this.cargado ? ESCALAMIENTOS_DEMO.length : 0,
      advertencia: this.cargado
        ? 'Datos sinteticos: ningun paciente de este turno existe.'
        : null,
    };
  }
}
