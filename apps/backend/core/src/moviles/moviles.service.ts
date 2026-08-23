/**
 * La flota: quién reporta dónde está, y quién puede verlo.
 *
 * Tarea 3.7. Dos operaciones y nada más:
 *
 *   reportar()  el móvil dice dónde está         → escribe, con alcance
 *   listar()    el CRUE (o un operador) mira     → lee, con alcance
 *
 * ── LO QUE ESTE SERVICIO NO HACE, Y NO DEBE HACER ─────────────────
 * No asigna móviles a casos, no propone reubicaciones, no ordena
 * desplazamientos. PULSO le MUESTRA la cobertura al CRUE; regular la flota es
 * función legal del CRUE (Res. 1220/2010) y cruzar esa línea debilita el
 * argumento del producto. Si alguien viene a pedir "un botón para mandar la
 * AMB-014 a Kennedy", la respuesta es no, y el motivo está aquí escrito.
 *
 * ── SIN PII EN LOGS ───────────────────────────────────────────────
 * Este archivo no tiene `Logger`. Loguear una posición es loguear dónde está
 * un paciente que va en camino, y la regla 5 del repo no distingue entre un
 * log de debug y uno de producción.
 */

import {
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Sede, TipoMovil } from '../contracts/types';
import { SedesService } from '../sedes/sedes.service';
import {
  ALMACEN_MOVILES,
  type AlmacenMoviles,
} from './moviles.almacen';
import {
  alcanceDe,
  puedeReportar,
  visiblesPara,
  type ActorMovil,
  type Alcance,
  type ModoIdentidad,
} from './actor';
import { localidadDe, type EstadoMovil, type ReporteEstado } from './posicion';
import { TrazaRepositorio, type PuntoTraza } from './traza.repositorio';

// ─────────────────────────────────────────────────────────────────
// Forma de la respuesta HTTP
// ─────────────────────────────────────────────────────────────────

export interface MovilVisible {
  id: string;
  organizacionId: string;
  /** null mientras el tipo no esté verificado contra la tabla `movil` (3.6). */
  tipo: TipoMovil | null;
  /**
   * false hoy, siempre. `tipoMovil` es un FILTRO DURO (un TAB no traslada un
   * paciente que requiere ventilación): que la consola sepa si el tipo está
   * verificado o autodeclarado no es un detalle de UI.
   */
  tipoVerificado: boolean;
  disponible: boolean;
  /** null = registrado y sin un solo reporte. Distinto de "reporte viejo". */
  posicion: {
    lat: number;
    lng: number;
    /** Radio de error del GPS en metros. Se dibuja; no se esconde. */
    precisionM: number | null;
    velocidadKmh: number | null;
    /** ISO, sellado por el servidor. El cliente calcula la antigüedad. */
    reportadoEn: string;
  } | null;
  /** Localidad ESTIMADA. Ver `localidadDerivada` en la respuesta. */
  localidad: string | null;
}

export interface RespuestaMoviles {
  moviles: MovilVisible[];
  /** 'red' = ve la ciudad (CRUE). 'organizacion' = solo su flota. */
  alcance: Alcance;
  /**
   * 'provisional' mientras 1.3 no emita actores reales. La consola LO DICE:
   * un alcance que se resuelve con una contraseña de turno no puede pintarse
   * igual que uno con identidad verificada.
   */
  identidad: ModoIdentidad;
  /** De dónde sale `localidad`. Hoy: la localidad de la sede más cercana. */
  localidadDerivada: 'sede-mas-cercana';
  ts: string;
}

@Injectable()
export class MovilesService {
  constructor(
    @Inject(ALMACEN_MOVILES) private readonly almacen: AlmacenMoviles,
    private readonly sedes: SedesService,
    private readonly config: ConfigService,
    // @Optional() con default: sin él, todo TestingModule que arme
    // MovilesService tendría que declarar TrazaRepositorio, y son varios
    // specs. Es el mismo patrón que AlmacenService — la traza es aditiva y
    // no debe obligar a tocar tests que no la usan.
    @Optional()
    private readonly traza: TrazaRepositorio = new TrazaRepositorio(),
  ) {}

  /** Lo que el servidor sabe de la sesión de turno. Ver `actor.ts`. */
  configuracionProvisional() {
    return {
      organizacion: this.config.get<string>('MOVILES_ORG_PROVISIONAL'),
      roles: this.config.get<string>('MOVILES_ROLES_PROVISIONAL'),
    };
  }

  /**
   * El móvil dice dónde está.
   *
   * Idempotente por naturaleza: reportar dos veces la misma posición deja el
   * mismo estado. El sello de tiempo lo pone el servidor, así que dos reportes
   * seguidos no pueden llegar "desordenados" por un reloj mal puesto.
   *
   * No escribe `evento_caso`: un reporte cada 15 segundos por móvil son ~240
   * filas por hora y por ambulancia en una tabla de auditoría append-only que
   * existe para decisiones humanas, no para telemetría. La traza de posiciones
   * tiene su propia tabla en la migración 0006. Lo que sí es auditable —abrir
   * y cerrar turno, cambiar la disponibilidad a mano— entra con 3.6.
   */
  async reportar(
    actor: ActorMovil,
    movilId: string,
    reporte: ReporteEstado,
  ): Promise<MovilVisible> {
    const previo = this.almacen.obtener(movilId);

    // El alcance se verifica ANTES de escribir y contra lo que el servidor
    // tiene guardado, nunca contra un campo del cuerpo.
    if (!puedeReportar(actor, previo?.movil.organizacionId ?? null)) {
      throw new ForbiddenException('Este móvil no pertenece a su organización');
    }

    // `puedeReportar` ya lo garantiza; se comprueba igual porque de este valor
    // depende en qué flota queda un móvil nuevo, y un `!` de TypeScript no es
    // una comprobación.
    const organizacionId = actor.organizacionId;
    if (!organizacionId) {
      throw new ForbiddenException('Sesión sin organización: no puede reportar');
    }

    const estado: EstadoMovil = {
      movil: previo?.movil ?? {
        id: movilId,
        // La organización sale del ACTOR, jamás del cuerpo de la petición:
        // así un operador no puede meter un móvil en la flota de otro.
        organizacionId,
        // Un móvil que aparece reportando y que nadie registró no puede
        // declarar su propio tipo — es el filtro duro del ruteo. Queda en
        // null ("sin verificar") hasta que 3.6 lo resuelva contra `movil`.
        tipo: null,
      },
      disponible: reporte.disponible,
      ultima: {
        coord: { lat: reporte.lat, lng: reporte.lng },
        precisionM: reporte.precisionM,
        velocidadKmh: reporte.velocidadKmh,
        reportadoEn: new Date().toISOString(),
      },
    };

    this.almacen.guardar(estado);

    // La traza va aparte del estado: `almacen` guarda DÓNDE ESTÁ, esto
    // guarda POR DÓNDE PASÓ. Sin lo segundo el mapa sólo puede pintar un
    // punto que salta, no un recorrido.
    // No se espera: perder un punto de telemetría no puede retrasar el
    // reporte, que es lo que mantiene viva la flota.
    void this.traza.anotar(movilId, organizacionId, {
      lat: reporte.lat,
      lng: reporte.lng,
      precisionM: reporte.precisionM,
      velocidadKmh: reporte.velocidadKmh,
      disponible: reporte.disponible,
      reportadoEn: estado.ultima?.reportadoEn ?? new Date().toISOString(),
    });

    return this.visible(estado, await this.sedes.todas());
  }

  /**
   * El recorrido de un móvil. Lo pinta el mapa como polilínea.
   *
   * Respeta el mismo alcance que `listar()`: un operador ve los suyos, el
   * CRUE ve la ciudad. Un recorrido es más sensible que una posición —
   * muestra dónde estuvo alguien todo el turno— así que el filtro va antes
   * de tocar la base, no después.
   */
  async recorrido(
    actor: ActorMovil,
    movilId: string,
    limite = 200,
    desde?: string,
  ): Promise<{ movilId: string; puntos: PuntoTraza[]; persistente: boolean }> {
    const estado = this.almacen.obtener(movilId);
    if (!puedeReportar(actor, estado?.movil.organizacionId ?? null)) {
      throw new ForbiddenException('Este móvil no pertenece a su organización');
    }
    return {
      movilId,
      puntos: await this.traza.recorrido(movilId, limite, desde),
      // La consola lo dice: un recorrido en memoria empieza en el último
      // reinicio, y eso no se puede pintar como si fuera el turno completo.
      persistente: this.traza.persistente,
    };
  }

  /** La flota que le corresponde ver a este actor. Filtrado en el servidor. */
  async listar(actor: ActorMovil): Promise<RespuestaMoviles> {
    const alcanzados = visiblesPara(actor, this.almacen.listar());
    const sedes = await this.sedes.todas();

    return {
      moviles: alcanzados.map((e) => this.visible(e, sedes)),
      alcance: alcanceDe(actor),
      identidad: actor.modo,
      localidadDerivada: 'sede-mas-cercana',
      ts: new Date().toISOString(),
    };
  }

  private visible(estado: EstadoMovil, sedes: readonly Sede[]): MovilVisible {
    return {
      id: estado.movil.id,
      organizacionId: estado.movil.organizacionId,
      tipo: estado.movil.tipo,
      // Hoy nunca es true: la verificación es la tabla `movil` de 3.6.
      tipoVerificado: false,
      disponible: estado.disponible,
      posicion: estado.ultima
        ? {
            lat: estado.ultima.coord.lat,
            lng: estado.ultima.coord.lng,
            precisionM: estado.ultima.precisionM,
            velocidadKmh: estado.ultima.velocidadKmh,
            reportadoEn: estado.ultima?.reportadoEn ?? new Date().toISOString(),
          }
        : null,
      localidad: estado.ultima ? localidadDe(estado.ultima.coord, sedes) : null,
    };
  }
}
