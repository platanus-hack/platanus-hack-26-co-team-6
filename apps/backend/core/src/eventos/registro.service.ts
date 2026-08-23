/**
 * RegistroService — el ÚNICO punto de escritura de `evento_caso`.
 *
 * La firma es la del plan maestro (§12.3 de la Parte II), con dos cosas que
 * el plan da por hechas y aquí se hacen cumplir:
 *
 *   1. **Idempotente.** El paramédico toca "ya llegué" dos veces con mala
 *      señal; el regulador confirma un override y el navegador reintenta.
 *      Con `claveIdempotencia`, el segundo intento devuelve el MISMO evento
 *      en vez de duplicar historia.
 *   2. **Sin PII.** El detalle de un evento lo lee un auditor externo. El
 *      dictado crudo y el teléfono del que reporta no entran, y no por
 *      convención: `registrar()` los rechaza. La lista blanca de
 *      `estado.service.ts::despojar()` protege la salida de `/estado`; esto
 *      protege la entrada del registro, que es la otra puerta.
 *
 * Y lo que NO tiene, a propósito: no hay `actualizar`, no hay `borrar`, no
 * hay `corregir` que edite. La corrección es `registrar({corrigeA})`.
 */

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ALMACEN_EVENTOS,
  type AlmacenEventos,
} from './almacen-eventos';
import {
  esTipoEvento,
  type EntradaEvento,
  type EventoCaso,
} from './evento.tipos';

/**
 * Claves que NUNCA entran al detalle de un evento.
 *
 * `textoCrudo` y `telefonoReporta` tienen su sitio: la fila del caso, detrás
 * de la sesión. Copiarlos a un evento los saca de esa puerta y los mete en la
 * que sí se exporta a JSON y a PDF. Se rechaza en vez de recortar en silencio
 * porque quien lo intentó tiene que enterarse — probablemente estaba pasando
 * el objeto `Caso` entero por comodidad.
 *
 * `origen` NO está en la lista y es deliberado: `llegada_escena` registra
 * hora y posición (§12, etapa 3), así que el dato es legítimo en algunos
 * eventos. Se protege en la lectura, redactándolo por rol — ver
 * `auditoria/redaccion.ts`.
 */
const PROHIBIDAS_EN_DETALLE = [
  'textoCrudo',
  'texto_crudo',
  'dictado',
  'telefono',
  'telefonoReporta',
  'telefono_reporta',
  'pacienteToken',
  'paciente_token',
];

@Injectable()
export class RegistroService {
  private readonly log = new Logger(RegistroService.name);

  constructor(
    @Inject(ALMACEN_EVENTOS) private readonly almacen: AlmacenEventos,
  ) {}

  async registrar(entrada: EntradaEvento): Promise<EventoCaso> {
    if (!entrada?.casoId?.trim()) {
      throw new BadRequestException('Un evento sin caso no es un evento');
    }
    if (!esTipoEvento(entrada.tipo)) {
      throw new BadRequestException(`Tipo de evento desconocido: ${entrada.tipo}`);
    }

    const detalle = entrada.detalle ?? {};
    const prohibida = PROHIBIDAS_EN_DETALLE.find((clave) => clave in detalle);
    if (prohibida) {
      throw new BadRequestException(
        `El detalle de un evento no lleva PII: quita "${prohibida}". ` +
          'El dictado y el teléfono viven en el caso, no en la línea de tiempo.',
      );
    }

    // Idempotencia ANTES de escribir. En Postgres el índice único es el que
    // manda; aquí se consulta primero para poder devolver el evento original
    // en vez de un 409 que quien llamó tendría que traducir.
    if (entrada.claveIdempotencia) {
      const previo = await this.almacen.porClave(
        entrada.casoId,
        entrada.tipo,
        entrada.claveIdempotencia,
      );
      if (previo) return previo;
    }

    // Una corrección que apunta a la nada es peor que no corregir: deja la
    // línea de tiempo diciendo "esto corrige algo" sin decir qué.
    if (entrada.corrigeA != null) {
      const corregido = await this.almacen.porId(entrada.corrigeA);
      if (!corregido) {
        throw new NotFoundException(
          `No existe el evento ${entrada.corrigeA} que se dice corregir`,
        );
      }
      if (corregido.casoId !== entrada.casoId) {
        throw new BadRequestException(
          'Una corrección no puede cruzar de caso',
        );
      }
    }

    const evento = await this.almacen.agregar({
      casoId: entrada.casoId,
      tipo: entrada.tipo,
      actor: entrada.actor,
      organizacionId: entrada.organizacionId ?? null,
      movilId: entrada.movilId ?? null,
      codigoSede: entrada.codigoSede ?? null,
      detalle,
      corrigeA: entrada.corrigeA ?? null,
      claveIdempotencia: entrada.claveIdempotencia ?? null,
      ocurridoEn: entrada.ocurridoEn ?? new Date().toISOString(),
    });

    // Sin PII en el log: tipo, caso, actor. El detalle NO se imprime.
    this.log.log(
      `evento ${evento.id} · ${evento.tipo} · caso ${evento.casoId} · ` +
        `actor ${evento.actor.id ?? 'sin-actor'} (${evento.actor.tipo})`,
    );

    return evento;
  }

  listar(casoId: string): Promise<EventoCaso[]> {
    return this.almacen.deCaso(casoId);
  }

  recientes(limite = 200): Promise<EventoCaso[]> {
    return this.almacen.recientes(limite);
  }

  /** En qué modo corre el registro. Lo pinta la vista forense. */
  modo(): 'memoria' | 'postgres' {
    return this.almacen.modo();
  }
}
