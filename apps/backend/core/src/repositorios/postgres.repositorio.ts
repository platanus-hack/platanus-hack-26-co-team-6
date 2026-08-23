/**
 * Repositorio en Postgres. El que hace que un `Ctrl+C` deje de borrar el
 * activo del producto.
 *
 * `upsert` en vez de `insert`: un handshake se guarda varias veces a lo largo
 * de su vida (enviado → aceptado, o → timeout con su latencia), y el vigilante
 * puede reintentar. Insertar sin más duplicaría filas y `pAceptacion` contaría
 * dos veces la misma respuesta.
 */

import { Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Caso, Handshake } from '../contracts/types';
import type { Instantanea, RepositorioPulso } from './repositorio';

/** La organización que 0009 crea para los datos previos a la afiliación. */
const ORG_HISTORICA = '00000000-0000-0000-0000-000000000001';

export class PostgresRepositorio implements RepositorioPulso {
  readonly clase = 'postgres' as const;
  private readonly log = new Logger(PostgresRepositorio.name);

  constructor(private readonly pool: Pool) {}

  async cargar(): Promise<Instantanea> {
    // Se traen los casos recientes, no la tabla entera: la caché existe para
    // servir el turno en curso, no para ser una réplica de la base.
    const casos = await this.pool.query(
      `select * from caso order by creado_en desc limit 500`,
    );
    const handshakes = await this.pool.query(
      `select * from handshake where caso_id = any($1::uuid[])`,
      [casos.rows.map((r) => r.id)],
    );
    return {
      casos: casos.rows.map(aCaso),
      handshakes: handshakes.rows.map(aHandshake),
    };
  }

  async guardarCaso(c: Caso): Promise<void> {
    await this.pool.query(
      `insert into caso (
         id, texto_crudo, resumen, triage, dx_cie, dx_descripcion,
         servicios_requeridos, complejidad_requerida, edad, sexo,
         signos_alarma, requiere_medico_abordo, confianza, tipo_movil,
         origen, creado_en, organizacion_id, movil_id, telefono_reporta
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
         st_makepoint($15,$16)::geography,$17,$18,$19,$20
       )
       on conflict (id) do update set
         resumen = excluded.resumen,
         triage = excluded.triage,
         servicios_requeridos = excluded.servicios_requeridos,
         confianza = excluded.confianza,
         tipo_movil = excluded.tipo_movil`,
      [
        c.id, c.textoCrudo, c.resumen, c.triage, c.dxCie10, c.dxDescripcion,
        c.serviciosRequeridos, c.complejidadRequerida, c.edad, c.sexo,
        c.signosAlarma, c.requiereMedicoABordo, c.confianza, c.tipoMovil,
        // PostGIS espera (lng, lat). Al revés de lo intuitivo, y es el error
        // más común de esta base: ver la trampa documentada en zaid-backend.
        c.origen.lng, c.origen.lat,
        c.creadoEn, ORG_HISTORICA, c.unidad?.id ?? null,
        c.telefonoReporta ?? null,
      ],
    );
  }

  async guardarHandshake(h: Handshake): Promise<void> {
    await this.pool.query(
      `insert into handshake (
         id, caso_id, codigo_sede, canal, estado, motivo_rechazo,
         enviado_en, expira_en, respondido_en, latencia_s, organizacion_id,
         eta_min_al_despachar, demora_avisada
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (id) do update set
         estado = excluded.estado,
         motivo_rechazo = excluded.motivo_rechazo,
         respondido_en = excluded.respondido_en,
         latencia_s = excluded.latencia_s,
         demora_avisada = excluded.demora_avisada`,
      [
        h.id, h.casoId, h.sedeCodigo, h.canal, h.estado, h.motivoRechazo,
        h.enviadoEn, h.expiraEn, h.respondidoEn, h.latenciaS, ORG_HISTORICA,
        h.etaMinAlDespachar ?? null, h.demoraAvisada ?? false,
      ],
    );
  }

  async limpiar(): Promise<void> {
    // `caso` borra sus handshakes en cascada (0001).
    await this.pool.query('delete from caso');
  }
}

// ── Fila → tipo del contrato ─────────────────────────────────────

function aCaso(r: Record<string, unknown>): Caso {
  return {
    id: String(r.id),
    textoCrudo: String(r.texto_crudo ?? ''),
    resumen: String(r.resumen ?? ''),
    triage: Number(r.triage) as Caso['triage'],
    dxCie10: (r.dx_cie as string) ?? null,
    dxDescripcion: String(r.dx_descripcion ?? ''),
    serviciosRequeridos: (r.servicios_requeridos as number[]) ?? [],
    complejidadRequerida: (r.complejidad_requerida as Caso['complejidadRequerida']) ?? 'alta',
    edad: (r.edad as number) ?? null,
    sexo: (r.sexo as Caso['sexo']) ?? 'desconocido',
    signosAlarma: (r.signos_alarma as string[]) ?? [],
    requiereMedicoABordo: Boolean(r.requiere_medico_abordo),
    confianza: Number(r.confianza ?? 0),
    tipoMovil: (r.tipo_movil as Caso['tipoMovil']) ?? 'TAB',
    // `origen` es geography y no se lee de vuelta: las coordenadas del
    // paciente son de los dos campos más sensibles del sistema, y ninguna
    // consola las pinta desde aquí. Se conservan en la base para auditoría.
    origen: { lat: 0, lng: 0 },
    unidad: r.movil_id ? { id: String(r.movil_id) } : null,
    telefonoReporta: (r.telefono_reporta as string) ?? null,
    creadoEn: aIso(r.creado_en),
  };
}

function aHandshake(r: Record<string, unknown>): Handshake {
  return {
    id: String(r.id),
    casoId: String(r.caso_id),
    sedeCodigo: String(r.codigo_sede),
    canal: r.canal as Handshake['canal'],
    estado: r.estado as Handshake['estado'],
    motivoRechazo: (r.motivo_rechazo as string) ?? null,
    enviadoEn: aIso(r.enviado_en),
    expiraEn: aIso(r.expira_en),
    respondidoEn: r.respondido_en ? aIso(r.respondido_en) : null,
    latenciaS: (r.latencia_s as number) ?? null,
    etaMinAlDespachar: (r.eta_min_al_despachar as number) ?? null,
    demoraAvisada: Boolean(r.demora_avisada),
  };
}

/** El contrato dice ISO 8601 en string. `pg` devuelve Date. */
function aIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v ?? '');
}
