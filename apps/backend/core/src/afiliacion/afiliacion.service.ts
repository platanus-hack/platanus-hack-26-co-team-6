/**
 * Afiliacion — tareas 2.1 (IPS) y 2.9 (operadores de ambulancia).
 *
 * ═══════════════════════════════════════════════════════════════════
 *  EL MODULO QUE ELIMINA SU PROPIO TRAMITE
 * ═══════════════════════════════════════════════════════════════════
 *  El afiliado escribe 12 digitos y PULSO le devuelve el nombre de SU sede
 *  con direccion, coordenadas, localidad, naturaleza, complejidad, servicios
 *  habilitados y camas — todo del REPS que ya esta en el repo. No lo tipea:
 *  lo confirma o lo corrige.
 *
 *  Es la demostracion mas barata de la tesis del producto: el mismo dato
 *  publico que rutea pacientes elimina el formulario de inscripcion.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  LOS TRES DESENLACES, Y POR QUE NINGUNO ES UN 404
 * ═══════════════════════════════════════════════════════════════════
 *    existe + nombre cuadra  → aprobada, verificacion 'reps_automatico'
 *    existe + nombre no      → en_verificacion (ojo humano), NO rechazo
 *    no existe               → observada, con el motivo EXACTO
 *
 *  Los tres viajan en un 200. Un 404 mudo obliga al afiliado a adivinar si
 *  escribio mal el codigo, si puso el de prestador en vez del de sede, o si
 *  su sede de verdad no esta en el corte del REPS — y son tres arreglos
 *  distintos. §3.2 lo dice con todas las letras: se le dice QUE falta, no
 *  «solicitud rechazada».
 *
 * ═══════════════════════════════════════════════════════════════════
 *  LA TRAMPA DE LOS DOS CODIGOS
 * ═══════════════════════════════════════════════════════════════════
 *  `codigo_habilitacion_sede` son 12 digitos y es unico por sede.
 *  `codigo_prestador` son 10 y colapsa una subred entera en un codigo — ya
 *  causo un bug que metio 9 sedes en una (`data/CATALOGO.md`). Por eso el
 *  validador exige 12 exactos y, cuando le llegan 10, lo dice con nombre
 *  propio en vez de responder «no encontrado».
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type {
  CrearAfiliacionRequest,
  CrearAfiliacionResponse,
  EstadoAfiliacion,
  Organizacion,
  PrecargaSede,
  Sede,
  VerificarAfiliacionRequest,
  VerificarAfiliacionResponse,
} from '../contracts/types';
import { PulsoError } from '../common/pulso-error.filter';
import { RepoActoresMemoria } from '../auth/actores';
import { SedesService } from '../sedes/sedes.service';
import { buscarOperador, cruceSuficiente, precargaDe } from './ambulancias';
import { esDespachable, exigeMotivo, exigirTransicion } from './estados';
import { normalizarNit } from './nit';
import {
  RepoOrganizacionesMemoria,
  type NuevaOrganizacion,
} from './organizaciones';
import { UMBRAL_SIMILITUD, normalizar, similitud } from './similitud';

/** El de sede. NO el de prestador, que son 10. */
const LARGO_CODIGO_SEDE = 12;

@Injectable()
export class AfiliacionService implements OnModuleInit {
  private readonly log = new Logger(AfiliacionService.name);

  constructor(
    private readonly sedes: SedesService,
    private readonly organizaciones: RepoOrganizacionesMemoria,
    // El repositorio de actores lo trae la tarea 1.3 y es @Global. Se usa el
    // concreto y no la interfaz `RepoActores` porque `registrar()` solo vive
    // en la implementacion en memoria — cuando llegue la tabla (1.1), sube a
    // la interfaz y esta linea pasa a ser el simbolo.
    private readonly actores: RepoActoresMemoria,
  ) {}

  onModuleInit(): void {
    // Regla del repo: todo degrada sin credenciales, y LO DICE.
    this.log.warn(
      'Afiliacion en memoria: las organizaciones y sus sedes se pierden al ' +
        'reiniciar. La tabla la crea supabase/migrations/0006_afiliacion.sql ' +
        '(o la 1.1 de identidad, la que aterrice primero).',
    );
  }

  // ── Paso 1: autoverificacion (§3.3) ───────────────────────────

  async verificar(
    peticion: VerificarAfiliacionRequest,
  ): Promise<VerificarAfiliacionResponse> {
    const nit = normalizarNit(peticion.nit);
    if (!nit) {
      throw new PulsoError(
        'PULSO_INVALID_INPUT',
        'El NIT es obligatorio: es lo que identifica a la entidad juridica.',
      );
    }

    return peticion.tipo === 'operador_ambulancia'
      ? this.verificarOperador(peticion, nit)
      : this.verificarSede(peticion);
  }

  /**
   * IPS y hospitales: se cruza contra la tabla `sede` (REPS).
   *
   * ⚠️ NO RECIBE EL NIT, Y ESO ES UN HUECO DECLARADO.
   *
   *    La tabla `sede` del REPS que tiene el repo no trae NIT — ni el
   *    catalogo compilado ni `0001_init.sql` tienen la columna. Asi que el
   *    NIT se valida como formato y se guarda, pero **no se puede cruzar**
   *    contra el registro del Estado.
   *
   *    Consecuencia concreta: alguien puede afiliar la sede REPS de una IPS
   *    real declarando el NIT de otra entidad. Lo que lo contiene hoy es la
   *    razon social —que si se cruza— y que la organizacion nace en
   *    `aprobada`, no en `activa`: entrar al ranking exige el acto humano de
   *    `admin_plataforma`.
   *
   *    Para cerrarlo hace falta el NIT por sede en la fuente. Es dato del
   *    REPS y esta publicado; hay que agregarlo al pipeline de `data/`.
   */
  private async verificarSede(
    peticion: VerificarAfiliacionRequest,
  ): Promise<VerificarAfiliacionResponse> {
    const codigo = soloDigitosDe(peticion.codigoHabilitacion);

    if (!codigo) {
      return observada(
        'Falta el codigo de habilitacion de sede. Son los 12 digitos que ' +
          'aparecen en el certificado de habilitacion, no el NIT.',
      );
    }
    if (codigo.length === 10) {
      // El error mas caro y el mas facil de cometer: los dos codigos estan
      // en el mismo certificado, uno debajo del otro.
      return observada(
        `'${codigo}' tiene 10 digitos: ese es el codigo de PRESTADOR, que ` +
          'agrupa todas las sedes de la entidad. La afiliacion necesita el ' +
          'codigo de SEDE, de 12 digitos.',
      );
    }
    if (codigo.length !== LARGO_CODIGO_SEDE) {
      return observada(
        `El codigo de habilitacion de sede son ${LARGO_CODIGO_SEDE} digitos ` +
          `y llegaron ${codigo.length}.`,
      );
    }

    const sede = await this.sedes.porCodigo(codigo);
    if (!sede) {
      return observada(
        `El codigo ${codigo} no esta en el corte del REPS que tiene PULSO. ` +
          'Puede ser una sede habilitada despues del ultimo corte: sigue con ' +
          'la afiliacion y queda en verificacion manual.',
      );
    }

    // Sin razon social declarada no hay nada que comparar, y aprobar por
    // «no dijo nada» seria peor que pedir un ojo humano.
    const declarada = peticion.razonSocial ?? '';
    const puntaje = similitud(declarada, sede.nombre);

    if (!normalizar(declarada)) {
      return {
        encontrada: true,
        requiereRevision: true,
        estadoSugerido: 'en_verificacion',
        verificacion: 'manual',
        sede,
        precarga: precargaSede(sede),
        motivo:
          'La sede existe en el REPS. Falta la razon social para poder ' +
          'confirmar que es la misma entidad.',
      };
    }

    if (puntaje < UMBRAL_SIMILITUD) {
      return {
        encontrada: true,
        requiereRevision: true,
        estadoSugerido: 'en_verificacion',
        verificacion: 'manual',
        sede,
        precarga: precargaSede(sede),
        similitud: puntaje,
        motivo:
          `El codigo ${codigo} existe, pero el REPS la registra como ` +
          `'${sede.nombre}'. Si es la misma sede con otro nombre comercial, ` +
          'sigue: la revisa una persona.',
      };
    }

    return {
      encontrada: true,
      estadoSugerido: 'aprobada',
      verificacion: 'reps_automatico',
      sede,
      precarga: precargaSede(sede),
      similitud: puntaje,
    };
  }

  /** Operadores de ambulancia: se cruza contra el catalogo TAB/TAM (2.9). */
  private verificarOperador(
    peticion: VerificarAfiliacionRequest,
    nit: string,
  ): VerificarAfiliacionResponse {
    const declarada = peticion.razonSocial ?? '';
    if (!normalizar(declarada)) {
      return observada(
        'Falta la razon social. El corte de transporte asistencial de la ' +
          'Secretaria no publica NIT, asi que el cruce es por nombre.',
      );
    }

    const cruce = buscarOperador(declarada, nit);
    if (!cruce) {
      return observada(
        `'${declarada}' no aparece en el corte de transporte asistencial de ` +
          'la Secretaria de Salud (01/07/2026). Sigue con la afiliacion: ' +
          'queda en verificacion manual con la habilitacion a la mano.',
      );
    }

    const operador = precargaDe(cruce.prestador);

    if (!cruceSuficiente(cruce)) {
      return {
        encontrada: true,
        requiereRevision: true,
        estadoSugerido: 'en_verificacion',
        verificacion: 'manual',
        operador,
        similitud: cruce.puntaje,
        motivo:
          `Lo mas parecido en el corte oficial es '${cruce.prestador.prestador}'. ` +
          'Si es la misma empresa, sigue: la revisa una persona.',
      };
    }

    return {
      encontrada: true,
      estadoSugerido: 'aprobada',
      verificacion: 'reps_automatico',
      operador,
      similitud: cruce.puntaje,
    };
  }

  // ── Paso 2: crear la organizacion y su primer admin ───────────

  async crear(
    peticion: CrearAfiliacionRequest,
  ): Promise<CrearAfiliacionResponse> {
    const nit = normalizarNit(peticion.nit);
    if (!nit || !peticion.razonSocial?.trim()) {
      throw new PulsoError(
        'PULSO_INVALID_INPUT',
        'La afiliacion necesita NIT y razon social.',
      );
    }
    const correo = (peticion.admin?.correo ?? '').trim().toLowerCase();
    if (!correo || !peticion.admin?.clave || !peticion.admin?.nombre?.trim()) {
      throw new PulsoError(
        'PULSO_INVALID_INPUT',
        'Falta el primer administrador: nombre, correo y contraseña. Sin el, ' +
          'nadie puede entrar a la organizacion despues de crearla.',
      );
    }

    const repetida = await this.organizaciones.porTipoYNit(peticion.tipo, nit);
    if (repetida) {
      throw new PulsoError(
        'PULSO_INVALID_INPUT',
        `Ya hay una afiliacion de tipo '${peticion.tipo}' con ese NIT, en ` +
          `estado '${repetida.estado}'. Si es tuya, entra con tu cuenta.`,
        { organizacionId: repetida.id, estado: repetida.estado },
      );
    }

    // Una sede la reclama UNA organizacion. Dos IPS afiliando el mismo
    // codigo dejan al handshake sin saber a quien avisarle.
    const sedes = [...new Set(peticion.sedes ?? [])];
    for (const codigo of sedes) {
      const dueña = await this.organizaciones.porSede(codigo);
      if (dueña) {
        throw new PulsoError(
          'PULSO_INVALID_INPUT',
          `La sede ${codigo} ya esta afiliada a otra organizacion. Si hubo ` +
            'un cambio de operador, lo tramita `admin_plataforma`.',
          { codigoSede: codigo },
        );
      }
    }

    // Se re-verifica en el servidor. Lo que el cliente diga que le respondio
    // `/afiliacion/verificar` no vale: eso es un dato del navegador.
    const verificacion = await this.verificar({
      tipo: peticion.tipo,
      codigoHabilitacion: sedes[0],
      nit,
      razonSocial: peticion.razonSocial,
    });

    const nueva: NuevaOrganizacion = {
      tipo: peticion.tipo,
      razonSocial: peticion.razonSocial.trim(),
      nombreCorto: peticion.nombreCorto?.trim() || null,
      nit,
      // Nace en `borrador` SIEMPRE, y de ahi camina por la maquina de
      // estados. Nacer directo en 'aprobada' saltaria las transiciones y
      // dejaria la afiliacion sin rastro de por donde paso.
      estado: 'borrador',
      verificacion:
        verificacion.verificacion === 'reps_automatico'
          ? 'reps_automatico'
          : 'pendiente',
      sedes,
      observaciones: verificacion.motivo ? [verificacion.motivo] : [],
    };

    let organizacion = await this.organizaciones.crear(nueva);
    organizacion = await this.caminarHasta(
      organizacion,
      verificacion.estadoSugerido,
      verificacion.motivo,
    );

    const registrado = await this.actores.registrar({
      identificador: correo,
      nombre: peticion.admin.nombre.trim(),
      organizacionId: organizacion.id,
      roles: ['admin_organizacion'],
      // Alcance vacio = toda su organizacion. Un admin no se ata a una sede.
      sedes: [],
      tipo: 'humano',
      clave: peticion.admin.clave,
    });

    // El correo NO va al log: es dato personal (regla 5). El id si — es lo
    // que despues resuelve la auditoria.
    this.log.log(
      `afiliacion creada: organizacion ${organizacion.id} (${organizacion.tipo}, ` +
        `${organizacion.estado}), admin ${registrado.id}`,
    );

    return {
      organizacion,
      admin: {
        id: registrado.id,
        organizacionId: registrado.organizacionId,
        nombre: registrado.nombre,
        roles: registrado.roles,
        sedes: registrado.sedes,
        tipo: registrado.tipo,
        activo: registrado.activo,
      },
    };
  }

  // ── Paso 3: la maquina de estados ─────────────────────────────

  /**
   * Cambia el estado validando la transicion. Es el unico camino: nadie
   * escribe `organizacion.estado` a mano.
   */
  async transicionar(
    id: string,
    hacia: EstadoAfiliacion,
    motivo?: string,
  ): Promise<Organizacion> {
    const organizacion = await this.exigirOrganizacion(id);
    exigirTransicion(organizacion.estado, hacia);

    if (exigeMotivo(hacia) && !motivo?.trim()) {
      throw new PulsoError(
        'PULSO_INVALID_INPUT',
        `Pasar a '${hacia}' exige decir por que. Sin motivo, el afiliado no ` +
          'sabe que corregir y nadie sabe quien lo decidio.',
      );
    }

    const actualizada = await this.organizaciones.guardar({
      ...organizacion,
      estado: hacia,
      observaciones: motivo?.trim()
        ? // Append-only: una correccion es una observacion nueva, no un
          // reemplazo. Es la regla 4 del repo.
          [...(organizacion.observaciones ?? []), motivo.trim()]
        : (organizacion.observaciones ?? []),
    });

    this.log.log(
      `organizacion ${id}: ${organizacion.estado} → ${hacia}` +
        (motivo ? ` (${motivo})` : ''),
    );
    return actualizada;
  }

  /**
   * Camina de `borrador` al estado que sugirio la verificacion, un paso a la
   * vez.
   *
   * Se recorre el camino completo en vez de saltar porque cada paso valida y
   * cada paso deja rastro. `borrador → aprobada` no existe en la tabla, y
   * que no exista es el punto.
   */
  private async caminarHasta(
    organizacion: Organizacion,
    destino: EstadoAfiliacion,
    motivo?: string,
  ): Promise<Organizacion> {
    const rutas: Partial<Record<EstadoAfiliacion, EstadoAfiliacion[]>> = {
      aprobada: ['enviada', 'en_verificacion', 'aprobada'],
      en_verificacion: ['enviada', 'en_verificacion'],
      observada: ['enviada', 'observada'],
    };
    let actual = organizacion;
    for (const paso of rutas[destino] ?? []) {
      actual = await this.transicionar(
        actual.id,
        paso,
        paso === destino ? motivo : undefined,
      );
    }
    return actual;
  }

  // ── Lo que consume el resto del sistema ───────────────────────

  async porId(id: string): Promise<Organizacion | undefined> {
    return this.organizaciones.porId(id);
  }

  async exigirOrganizacion(id: string): Promise<Organizacion> {
    const organizacion = await this.organizaciones.porId(id);
    if (!organizacion) {
      throw new PulsoError(
        'PULSO_INVALID_INPUT',
        'No existe esa organizacion.',
        { organizacionId: id },
      );
    }
    return organizacion;
  }

  /**
   * ¿Se le puede despachar un paciente a esta sede? — tarea 2.1, paso 4.
   *
   * ⚠️ LA REGLA TIENE UNA MITAD QUE NO ES OBVIA, Y ES DELIBERADA.
   *
   *    «Solo `activa` es despachable» aplica a las sedes que ALGUIEN
   *    afilio. Una sede del REPS que nadie reclamo todavia sigue siendo
   *    despachable — hoy son las 84, porque el registro de organizaciones
   *    arranca vacio en cada reinicio.
   *
   *    Lo contrario —exigir afiliacion para rutear— vaciaria el ranking
   *    entero el dia que esto se encienda, y «el conjunto vacio escala al
   *    CRUE» convertiria cada caso en una escalada. Es el caso limite 19 de
   *    multitenancy §7: los datos previos a la migracion no se dejan en
   *    limbo, se marcan y se dejan funcionar.
   *
   *    Lo que SI cierra desde ya: una sede afiliada y suspendida sale del
   *    ranking de inmediato, que es el caso que importa.
   */
  async sedeDespachable(codigoSede: string): Promise<boolean> {
    const organizacion = await this.organizaciones.porSede(codigoSede);
    return organizacion ? esDespachable(organizacion.estado) : true;
  }

  /** Los codigos de sede que hoy NO se pueden despachar. Lo usa el ranking. */
  async sedesNoDespachables(): Promise<Set<string>> {
    const fuera = new Set<string>();
    for (const organizacion of await this.organizaciones.todas()) {
      if (esDespachable(organizacion.estado)) continue;
      for (const codigo of organizacion.sedes) fuera.add(codigo);
    }
    return fuera;
  }
}

/** Lo que el REPS ya sabe. Sin `nombre`: ese se muestra aparte, en grande. */
export const precargaSede = (sede: Sede): PrecargaSede => ({
  direccion: sede.direccion,
  coord: sede.coord,
  localidad: sede.localidad,
  naturaleza: sede.naturaleza,
  complejidad: sede.complejidad,
  telefono: sede.telefono,
  servicios: [...sede.servicios],
  camas: sede.camas.map((c) => ({ ...c })),
});

/**
 * Digitos y nada mas.
 *
 * Para el codigo de habilitacion, NO para el NIT: el codigo son 12 digitos
 * exactos y no lleva digito de verificacion. El NIT si, y por eso tiene su
 * propio normalizador en `nit.ts`.
 */
const soloDigitosDe = (valor?: string): string =>
  (valor ?? '').replace(/\D/g, '');

/** No encontrada, con motivo. Es un 200: §3.2 pide decir QUE falta. */
const observada = (motivo: string): VerificarAfiliacionResponse => ({
  encontrada: false,
  estadoSugerido: 'observada',
  verificacion: 'pendiente',
  motivo,
});
