/**
 * El expediente forense de un caso — tarea 4.12.
 *
 * Reconstruye lo que pasó: cada evento, cada actor, y la evidencia con la que
 * el motor eligió destino. **Es la vista que hace defendible todo lo demás**
 * ante un jurado, una interventoría o un juez; sin ella, "todo es auditable"
 * es una afirmación sin pantalla que la respalde.
 *
 * Tres reglas gobiernan este archivo:
 *
 *   1. **La lectura es un acceso y queda registrada.** Abrir un expediente
 *      escribe su propio `lectura_auditoria`. Sí, eso significa que el
 *      expediente contiene la huella de quien lo abrió, incluida la tuya:
 *      es exactamente el punto.
 *   2. **El alcance se verifica AQUÍ, en el servidor.** Un
 *      `admin_organizacion` no ve casos ajenos aunque teclee la URL.
 *   3. **Se redacta antes de salir**, y se dice qué se redactó
 *      (`redaccion.ts`).
 */

import {
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { RoutingDecisionEvidence } from '../contracts/types';
import {
  motivoDeNegacion,
  type ActorSolicitante,
} from '../eventos/actor.service';
import type { EventoCaso, TipoEvento } from '../eventos/evento.tipos';
import { RegistroService } from '../eventos/registro.service';
import {
  ROUTING_STORE,
  type RoutingStore,
} from '../persistence/routing-store';
import type {
  EvidenciaExpediente,
  ExpedienteCaso,
  FilaExpediente,
} from './auditoria.tipos';
import { politicaDe, redactar, rolLector, ROLES_LECTORES } from './redaccion';

/**
 * De los 22 tipos del vocabulario, los que algún servicio escribe HOY.
 *
 * Es la frontera con la tarea 3.2 (cablear los 22 eventos, carril de Sebas)
 * escrita en el sitio donde se nota: el expediente la publica para que nadie
 * lea una línea de tiempo corta como "no pasó nada más".
 */
const TIPOS_CABLEADOS: TipoEvento[] = ['override_crue', 'lectura_auditoria'];

const NOTA_COBERTURA =
  'De los 22 tipos de evento del sistema, core escribe hoy 2: el override del ' +
  'CRUE (tarea 3.11) y la lectura de este expediente (4.12). Los otros 20 ' +
  '—creación del caso, despacho, aceptación, timeout, re-ruteo, llegada, ' +
  'entrega— ocurren y todavía no se persisten: los cablea la tarea 3.2. Lo que ' +
  'esta línea de tiempo no muestra, hoy no está guardado en ninguna parte.';

@Injectable()
export class AuditoriaService {
  constructor(
    private readonly registro: RegistroService,
    @Inject(ROUTING_STORE) private readonly ruteo: RoutingStore,
  ) {}

  async expediente(
    casoId: string,
    solicitante: ActorSolicitante,
  ): Promise<ExpedienteCaso> {
    const rol = rolLector(solicitante.roles);
    if (!rol) {
      throw new ForbiddenException(motivoDeNegacion(solicitante, ROLES_LECTORES));
    }

    const eventos = await this.registro.listar(casoId);

    // ── Alcance de inquilino, verificado en el servidor ──────────
    //
    // Un `admin_organizacion` solo ve lo suyo, y "no sé de quién es" NO
    // cuenta como suyo: sin un evento que ate el caso a una organización no
    // hay forma de afirmar que le corresponde, y la ausencia de información
    // nunca es permiso. `auditor` y `regulador_crue` ven toda la red por
    // función (spec §10.4).
    if (rol === 'admin_organizacion') {
      const duena = organizacionDelCaso(eventos);
      if (!solicitante.organizacionId || duena !== solicitante.organizacionId) {
        throw new ForbiddenException(
          duena
            ? 'Este caso pertenece a otra organización.'
            : 'Este caso no tiene organización registrada todavía, así que no ' +
              'se puede afirmar que sea de la tuya. Un auditor o el regulador ' +
              'del CRUE sí pueden abrirlo.',
        );
      }
    }

    // ── El acceso queda registrado ANTES de entregar nada ────────
    //
    // Antes y no después: si algo falla al construir la respuesta, el intento
    // de acceso ya quedó escrito. Un expediente que solo registra las
    // lecturas exitosas es un registro de lecturas convenientes.
    await this.registro.registrar({
      casoId,
      tipo: 'lectura_auditoria',
      actor: {
        id: solicitante.id,
        nombre: solicitante.nombre,
        tipo: solicitante.tipo,
      },
      organizacionId: solicitante.organizacionId,
      detalle: {
        rolEfectivo: rol,
        vista: 'expediente-forense',
        identidadProvisional: solicitante.provisional,
      },
    });

    const politica = politicaDe(rol);
    // Se relee para que la propia lectura aparezca en la línea de tiempo. Es
    // la demostración en pantalla de que el acceso deja rastro.
    const conLaLectura = await this.registro.listar(casoId);

    const decision = await this.ruteo.decision(casoId);
    const evidencia = decision?.evidence
      ? construirEvidencia(decision.state, decision.evidence, politica.claves)
      : decision
        ? construirEvidencia(decision.state, null, politica.claves)
        : null;

    const filas = conLaLectura.map((e) => aFila(e, politica.claves));

    // Si nadie escribió `match_calculado` (hoy nadie: es 3.2), la evidencia
    // del ruteo se queda huérfana. En vez de esconderla se le da su propia
    // fila, declarada como lo que es: otra fuente, sin hora sellada.
    if (evidencia && !conLaLectura.some((e) => e.tipo === 'match_calculado')) {
      filas.push({
        clave: 'evidencia:match',
        fuente: 'pulso_routing_decision_audit',
        eventoId: null,
        ocurridoEn: null,
        tipo: 'match_calculado',
        actor: { id: 'sys:routing', nombre: null, tipo: 'sistema' },
        organizacionId: null,
        codigoSede: evidencia.selectedDestination,
        movilId: null,
        detalle: {
          nota:
            'Reconstruido desde pulso_routing_decision_audit. No hay ' +
            'evento_caso match_calculado porque todavía nadie lo escribe ' +
            '(tarea 3.2).',
        },
        corrigeA: null,
        redactados: [],
      });
    }

    const modo = this.registro.modo();

    return {
      casoId,
      generadoEn: new Date().toISOString(),
      solicitante: {
        id: solicitante.id,
        tipo: solicitante.tipo,
        roles: solicitante.roles,
        organizacionId: solicitante.organizacionId,
        rolEfectivo: rol,
        identidadProvisional: solicitante.provisional,
      },
      politicaRedaccion: politica,
      filas,
      evidencia,
      registro: {
        modo,
        advertencia:
          modo === 'memoria'
            ? 'El registro vive en memoria: sobrevive a recargar el navegador y ' +
              'a cambiar de máquina, pero se pierde si core reinicia (tarea 3.1).'
            : null,
      },
      cobertura: { tiposCableados: TIPOS_CABLEADOS, nota: NOTA_COBERTURA },
    };
  }
}

/** La organización del caso es la del primer actor que dejó rastro en él. */
function organizacionDelCaso(eventos: EventoCaso[]): string | null {
  return (
    eventos.find((e) => e.tipo === 'caso_creado' && e.organizacionId)
      ?.organizacionId ??
    eventos.find((e) => e.organizacionId)?.organizacionId ??
    null
  );
}

function aFila(evento: EventoCaso, claves: readonly string[]): FilaExpediente {
  const detalle = redactar(evento.detalle, claves);
  return {
    clave: `evento:${evento.id}`,
    fuente: 'evento_caso',
    eventoId: evento.id,
    ocurridoEn: evento.ocurridoEn,
    tipo: evento.tipo,
    actor: evento.actor,
    organizacionId: evento.organizacionId,
    codigoSede: evento.codigoSede,
    movilId: evento.movilId,
    detalle: detalle.valor,
    corrigeA: evento.corrigeA,
    redactados: detalle.redactados,
  };
}

function construirEvidencia(
  estado: 'matched' | 'escalated_to_crue',
  cruda: RoutingDecisionEvidence | null,
  claves: readonly string[],
): EvidenciaExpediente {
  if (!cruda) {
    // Escalado al CRUE: el motor guardó la decisión sin evidencia porque no
    // hubo destino que elegir. Es un hecho del expediente, no un vacío.
    return {
      estado,
      modelVersion: null,
      configVersion: null,
      selectedDestination: null,
      etaProvenance: null,
      minuteBreakdown: {},
      fingerprint: null,
      inputs: null,
      candidates: [],
    };
  }

  return {
    estado,
    modelVersion: cruda.modelVersion,
    configVersion: cruda.configVersion,
    selectedDestination: cruda.selectedDestination,
    etaProvenance: cruda.etaProvenance,
    minuteBreakdown: { ...cruda.minuteBreakdown },
    fingerprint: cruda.fingerprint,
    // `inputs` es el Caso ENTERO tal como entró al motor: trae `textoCrudo` y
    // `origen`. Aquí es donde la PII se escaparía si esto fuera un `...spread`.
    inputs: redactar(cruda.inputs, claves).valor,
    candidates: redactar(cruda.candidates, claves).valor,
  };
}
