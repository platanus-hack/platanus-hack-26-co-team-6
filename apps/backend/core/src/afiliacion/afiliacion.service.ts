/**
 * Afiliación — tarea 2.1.
 *
 * ── LA TESIS DEL MÓDULO ───────────────────────────────────────────
 * Es el trámite que se elimina a sí mismo. El afiliado escribe doce dígitos y
 * PULSO precarga dirección, coordenadas, localidad, naturaleza, complejidad,
 * servicios habilitados y camas desde el mismo REPS que ya usa para rutear.
 * El humano no tipea nada de eso: lo CONFIRMA o lo CORRIGE. Ver §3.3 de
 * `docs/pulso-plataforma-afiliacion-y-tramites.md`.
 *
 * ── DÓNDE VIVE EL ESTADO ──────────────────────────────────────────
 * En un `Map`, igual que `AlmacenService`, y por la misma razón: todo tiene
 * que correr sin Supabase configurado. La tabla real está en
 * `supabase/migrations/0004_afiliacion.sql` y el día que haya Postgres esto
 * pasa a ser un repositorio con la misma firma. **Se pierde al reiniciar** —
 * es el hueco conocido de la tarea 1.2, no uno nuevo.
 *
 * ── LA REGLA DE DEGRADACIÓN, VISIBLE ──────────────────────────────
 * El cruce contra sedes va por `SedesService`, que ya lee de Supabase cuando
 * hay credenciales y del catálogo compilado cuando no. Cada respuesta lleva
 * `fuente`, porque "no encontrada" significa cosas distintas contra 16.181
 * sedes que contra las 84 del catálogo del repo, y el afiliado merece saber
 * cuál de las dos le contestó. `GET /capacidades` ya reporta lo mismo en su
 * campo `datos`.
 *
 * ── LO QUE NO HACE, A PROPÓSITO ───────────────────────────────────
 * No emite sesión al crear la afiliación. El Anexo A la dibuja devolviendo un
 * `token`, pero hoy la sesión es una contraseña compartida de turno: emitir un
 * token desde un endpoint público le daría a cualquiera que llene el
 * formulario una sesión válida para las tres consolas. El login por actor real
 * es la tarea 1.3 y es quien tiene que emitirlo.
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { PulsoError } from '../common/pulso-error.filter';
import type { Sede } from '../contracts/types';
import { SedesService } from '../sedes/sedes.service';
import { SupabaseService } from '../sedes/supabase.service';
import { verificarOperador } from './ambulancias';
import {
  esDespachable,
  exigirTransicion,
  transicionesValidas,
} from './estados';
import { UMBRAL_COINCIDENCIA, similitud } from './similitud';
import type {
  ActorPublico,
  CrearAfiliacionRequest,
  CrearAfiliacionResponse,
  EstadoAfiliacion,
  EstadoAfiliacionResponse,
  EventoAfiliacion,
  FuenteVerificacion,
  Organizacion,
  PrecargaSede,
  SedeAfiliada,
  VerificacionAfiliacion,
  VerificarAfiliacionRequest,
} from './tipos';

/** El código de habilitación de SEDE. Doce. Ver la trampa más abajo. */
const LARGO_CODIGO_SEDE = 12;
/** El código de PRESTADOR. Diez. El que no hay que usar. */
const LARGO_CODIGO_PRESTADOR = 10;

/**
 * Fila interna. Tiene los campos que NO salen del servidor (correo, teléfono,
 * hash de contraseña); lo que sale lo arma `despojarOrganizacion()`.
 */
interface RegistroInterno {
  organizacion: Organizacion;
  actor: ActorPublico & {
    correo: string;
    telefono: string | null;
    passwordHash: string | null;
    registroProfesional: string | null;
  };
  /** Append-only. Nadie edita ni borra: corregir es escribir otro evento. */
  eventos: EventoAfiliacion[];
}

@Injectable()
export class AfiliacionService {
  private readonly log = new Logger(AfiliacionService.name);

  /** id → registro */
  private readonly registros = new Map<string, RegistroInterno>();
  /** `${tipo}:${nit}` → id. Espeja el `unique (tipo, nit)` de la migración. */
  private readonly porTipoYNit = new Map<string, string>();

  constructor(
    private readonly sedes: SedesService,
    private readonly supabase: SupabaseService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  //  Verificación — POST /afiliacion/verificar
  // ═══════════════════════════════════════════════════════════════

  async verificar(
    entrada: VerificarAfiliacionRequest,
  ): Promise<VerificacionAfiliacion> {
    const fuente = this.fuente();

    // El NIT es la identidad legal de quien se afilia y no se cruza contra
    // nada (ni el catálogo de sedes ni el de ambulancias lo publican), así
    // que lo único que se puede hacer es exigir que esté bien escrito.
    const nit = this.revisarNit(entrada?.nit, fuente);
    if (nit.bloqueo) return nit.bloqueo;

    return this.conNitSospechoso(
      await this.cruzar(entrada, fuente),
      nit.dvSospechoso,
    );
  }

  /** El cruce propiamente dicho, ya con el NIT revisado. */
  private async cruzar(
    entrada: VerificarAfiliacionRequest,
    fuente: FuenteVerificacion,
  ): Promise<VerificacionAfiliacion> {
    switch (entrada.tipo) {
      case 'ips':
        return this.verificarIps(entrada, fuente);

      case 'operador_ambulancia':
        // El registro de transporte asistencial es un archivo del repo, no
        // Supabase: la fuente la fija `verificarOperador` y no esta capa.
        return verificarOperador(entrada);

      case 'crue':
      case 'entidad_pagadora':
        // No hay registro público contra el cual cruzarlos. Decirlo es mejor
        // que devolver "no encontrada" y dejar creer que se buscó.
        return {
          encontrada: false,
          requiereRevision: true,
          motivo: 'tipo_sin_fuente_automatica',
          mensaje:
            `No existe un registro público contra el cual autoverificar un ` +
            `"${entrada.tipo}". La afiliación pasa a revisión de la plataforma; ` +
            `no está rechazada.`,
          falta: [
            'acto administrativo o convenio que acredite la entidad',
            'NIT con dígito de verificación',
          ],
          fuente,
        };

      default:
        throw new PulsoError(
          'PULSO_INVALID_INPUT',
          `tipo desconocido: "${String(entrada?.tipo)}". Debe ser uno de: ` +
            `ips, operador_ambulancia, crue, entidad_pagadora.`,
        );
    }
  }

  /**
   * El camino sin trámite de §3.3.
   *
   * ⚠️ LA TRAMPA QUE YA COSTÓ UN BUG (documentada en `data/CATALOGO.md`):
   *    `codigohabilitacionsede` tiene 12 dígitos y es único — 16.181 de
   *    16.181. `codigoprestador` tiene 10 y COLAPSA UNA SUBRED ENTERA en un
   *    solo código: usarlo metió nueve sedes distintas bajo el mismo id. Por
   *    eso un código de diez dígitos no se busca "por si acaso": se rechaza
   *    con un motivo que dice exactamente cuál es la confusión.
   */
  private async verificarIps(
    entrada: VerificarAfiliacionRequest,
    fuente: FuenteVerificacion,
  ): Promise<VerificacionAfiliacion> {
    const crudo = (entrada.codigoHabilitacion ?? '').trim();

    if (!crudo) {
      return {
        encontrada: false,
        requiereRevision: false,
        motivo: 'codigo_habilitacion_faltante',
        mensaje:
          'Falta el código de habilitación de sede: son los 12 dígitos que ' +
          'aparecen en el certificado de habilitación del REPS.',
        falta: ['código de habilitación de sede (12 dígitos)'],
        fuente,
      };
    }

    if (!/^\d+$/.test(crudo)) {
      return {
        encontrada: false,
        requiereRevision: false,
        motivo: 'codigo_habilitacion_no_numerico',
        mensaje:
          'El código de habilitación de sede son 12 dígitos, sin letras, ' +
          'espacios ni guiones.',
        falta: ['código de habilitación de sede (12 dígitos)'],
        fuente,
      };
    }

    if (crudo.length === LARGO_CODIGO_PRESTADOR) {
      return {
        encontrada: false,
        requiereRevision: false,
        motivo: 'codigo_es_de_prestador_no_de_sede',
        mensaje:
          'Ese código tiene 10 dígitos: es el código de PRESTADOR, no el de ' +
          'sede. Un prestador puede tener decenas de sedes bajo el mismo ' +
          'número (una subred entera comparte uno), así que con él no se sabe ' +
          'a qué sede te estás afiliando. El de sede tiene 12 dígitos y suele ' +
          'ser el de prestador con dos dígitos más al final.',
        falta: ['código de habilitación de SEDE (12 dígitos)'],
        fuente,
      };
    }

    if (crudo.length !== LARGO_CODIGO_SEDE) {
      return {
        encontrada: false,
        requiereRevision: false,
        motivo: 'codigo_habilitacion_longitud_invalida',
        mensaje:
          `El código de habilitación de sede tiene 12 dígitos; este trae ` +
          `${crudo.length}.`,
        falta: ['código de habilitación de sede (12 dígitos)'],
        fuente,
      };
    }

    const sede = await this.sedes.porCodigo(crudo);

    if (!sede) {
      const universo =
        fuente === 'supabase'
          ? 'el catálogo REPS cargado en la base'
          : 'las 84 sedes con urgencias del catálogo compilado del repo ' +
            '(sin Supabase configurado, PULSO no ve las 16.181 sedes del REPS)';
      return {
        encontrada: false,
        requiereRevision: false,
        motivo: 'sede_fuera_del_catalogo_cargado',
        mensaje:
          `El código ${crudo} no está en ${universo}. Si la sede existe y está ` +
          `habilitada, la afiliación no queda rechazada: queda observada hasta ` +
          `que un humano la cargue.`,
        falta: ['certificado de habilitación de la sede en PDF'],
        fuente,
      };
    }

    const precargaSede = precargar(sede);
    const razonSocial = entrada.razonSocial?.trim();

    // Sin nombre con qué contrastar no se puede AFIRMAR que quien pide es
    // quien dice ser: el código de habilitación es público. Se devuelve la
    // precarga igual — la pantalla de §3.4 la necesita para mostrar la sede
    // que encontró, y ese es el momento que vende el producto — pero marcada
    // para revisión, no como verificación automática.
    if (!razonSocial) {
      return {
        encontrada: true,
        requiereRevision: true,
        motivo: 'sin_razon_social_para_contrastar',
        mensaje:
          `Encontramos la sede "${sede.nombre}", pero sin razón social no ` +
          `podemos confirmar que sea tuya: el código de habilitación es ` +
          `público. Confirma el nombre para completar la verificación.`,
        falta: ['razón social de la organización'],
        precargaSede,
        fuente,
      };
    }

    const coincidencia = similitud(razonSocial, sede.nombre);

    if (coincidencia > UMBRAL_COINCIDENCIA) {
      return {
        encontrada: true,
        requiereRevision: false,
        coincidencia,
        mensaje:
          `Verificada contra el REPS: "${sede.nombre}". Precargamos dirección, ` +
          `ubicación, complejidad, ${precargaSede.servicios.length} servicios ` +
          `habilitados y ${precargaSede.camas.length} tipos de cama. ` +
          `Revísalo y corrige lo que esté viejo.`,
        falta: [],
        precargaSede,
        fuente,
      };
    }

    return {
      encontrada: true,
      requiereRevision: true,
      motivo: 'nombre_no_coincide_con_reps',
      coincidencia,
      sugerencia: sede.nombre,
      mensaje:
        `El código ${crudo} existe, pero está a nombre de "${sede.nombre}" y ` +
        `tú escribiste "${razonSocial}". Puede ser un cambio de razón social ` +
        `que el REPS no ha registrado: lo revisa un humano.`,
      falta: ['certificado de cámara de comercio o acto de cambio de nombre'],
      precargaSede,
      fuente,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  Alta — POST /afiliacion
  // ═══════════════════════════════════════════════════════════════

  /**
   * Crea la organización en `borrador`, la vincula a sus sedes y le pone su
   * primer `admin_organizacion`.
   *
   * ── POR QUÉ NO QUEDA `activa` ─────────────────────────────────
   * §3.4 dibuja la pantalla 4 diciendo "queda activa", pero eso choca con la
   * regla 6 de AGENTS.md: nada con consecuencia entra en operación sin
   * confirmación humana registrada, y `activa` es literalmente el permiso para
   * recibir un paciente crítico. Cuando el cruce contra el REPS sale limpio,
   * la organización recorre sola `borrador → enviada → en_verificacion →
   * aprobada` — cada salto por la máquina de estados y cada uno con su evento
   * — y **ahí se detiene**. Activar es un acto humano y deja su propio evento.
   *
   * ── IDEMPOTENCIA ──────────────────────────────────────────────
   * `unique (tipo, nit)` en la migración. Repetir el POST con el mismo par
   * devuelve lo que ya existe con `yaExistia:true` en vez de crear un duplicado
   * o reventar: el formulario público se reenvía sola con un doble clic.
   */
  async crear(
    entrada: CrearAfiliacionRequest,
  ): Promise<CrearAfiliacionResponse> {
    this.exigir(!!entrada?.tipo, 'Falta tipo de organización.');
    this.exigir(!!entrada?.nit?.trim(), 'Falta el NIT.');
    this.exigir(!!entrada?.razonSocial?.trim(), 'Falta la razón social.');
    this.exigir(
      !!entrada?.admin?.nombre?.trim(),
      'Falta el nombre del administrador.',
    );
    this.exigir(
      !!entrada?.admin?.correo?.trim(),
      'Falta el correo del administrador.',
    );

    const codigos = (entrada.sedes ?? []).map((c) => c.trim()).filter(Boolean);
    const clave = `${entrada.tipo}:${soloDigitos(entrada.nit)}`;

    const existente = this.porTipoYNit.get(clave);
    if (existente) {
      const registro = this.registros.get(existente)!;
      return {
        organizacion: registro.organizacion,
        actor: despojarActor(registro.actor),
        verificacion: await this.verificar({
          tipo: entrada.tipo,
          nit: entrada.nit,
          razonSocial: entrada.razonSocial,
          codigoHabilitacion: codigos[0],
        }),
        siguientePaso: this.siguientePaso(registro.organizacion.estado),
        yaExistia: true,
      };
    }

    const verificacion = await this.verificar({
      tipo: entrada.tipo,
      nit: entrada.nit,
      razonSocial: entrada.razonSocial,
      codigoHabilitacion: codigos[0],
    });

    const ahora = new Date().toISOString();
    const id = randomUUID();

    // Una sede queda `verificada` solo si el cruce automático salió limpio Y
    // es el código que se cruzó. Las demás entran sin verificar: afiliar diez
    // sedes de un tirón no puede verificar nueve que nadie miró.
    const sedes: SedeAfiliada[] = await Promise.all(
      codigos.map(async (codigoSede, i) => ({
        codigoSede,
        verificada:
          i === 0
            ? verificacion.encontrada && !verificacion.requiereRevision
            : (await this.sedes.porCodigo(codigoSede)) !== undefined,
        activa: true,
        vinculadaEn: ahora,
      })),
    );

    const organizacion: Organizacion = {
      id,
      tipo: entrada.tipo,
      razonSocial: entrada.razonSocial.trim(),
      nombreCorto: entrada.nombreCorto?.trim() || null,
      nit: entrada.nit.trim(),
      estado: 'borrador',
      verificacion: 'pendiente',
      verificadaEn: null,
      sedes,
      creadaEn: ahora,
      actualizadaEn: ahora,
    };

    const actor: RegistroInterno['actor'] = {
      id: randomUUID(),
      organizacionId: id,
      tipo: 'humano',
      nombre: entrada.admin.nombre.trim(),
      // El primer actor de una organización es siempre su admin. Los demás
      // roles entran por invitación (tarea 2.5), nunca por este endpoint:
      // es público y nadie se autoproclama `admin_plataforma`.
      roles: ['admin_organizacion'],
      sedes: codigos,
      activo: true,
      creadoEn: ahora,
      correo: entrada.admin.correo.trim(),
      telefono: entrada.admin.telefono?.trim() || null,
      passwordHash: entrada.admin.password
        ? hashearPassword(entrada.admin.password)
        : null,
      registroProfesional: entrada.admin.registroProfesional?.trim() || null,
    };

    const registro: RegistroInterno = { organizacion, actor, eventos: [] };
    this.registros.set(id, registro);
    this.porTipoYNit.set(clave, id);

    this.anotar(registro, {
      tipo: 'verificacion',
      motivo: verificacion.motivo,
      mensaje: verificacion.mensaje,
      por: 'sistema',
    });

    // Sin PII: ni razón social, ni correo, ni NIT. El id basta para seguirle
    // el rastro en la auditoría (regla 5 de AGENTS.md).
    this.log.log(
      `afiliación ${id} creada · tipo=${entrada.tipo} · ` +
        `cruce=${verificacion.encontrada ? 'sí' : 'no'} · ` +
        `revision=${verificacion.requiereRevision ? 'sí' : 'no'}`,
    );

    this.recorrerVerificacion(registro, verificacion);

    return {
      organizacion: registro.organizacion,
      actor: despojarActor(actor),
      verificacion,
      siguientePaso: this.siguientePaso(registro.organizacion.estado),
      yaExistia: false,
    };
  }

  /**
   * Lleva la afiliación recién creada hasta donde el cruce la deja.
   *
   * Cada salto pasa por `exigirTransicion` — no se escribe el estado a mano —
   * y deja su evento. Así la organización que se autoverificó y la que revisó
   * un humano tienen el mismo expediente, con los mismos renglones.
   */
  private recorrerVerificacion(
    registro: RegistroInterno,
    verificacion: VerificacionAfiliacion,
  ): void {
    this.mover(registro, 'enviada', 'sistema', 'Solicitud enviada.');
    this.mover(
      registro,
      'en_verificacion',
      'sistema',
      'Cruce automático contra el registro público.',
    );

    if (verificacion.encontrada && !verificacion.requiereRevision) {
      registro.organizacion.verificacion = 'reps_automatico';
      registro.organizacion.verificadaEn = new Date().toISOString();
      this.mover(registro, 'aprobada', 'sistema', verificacion.mensaje);
      return;
    }

    if (verificacion.encontrada) {
      // Cruzó pero algo no calza: se queda en verificación esperando humano.
      // No se observa ni se aprueba sola — es exactamente el caso "existe pero
      // el nombre no coincide" de §3.3.
      this.anotar(registro, {
        tipo: 'observacion',
        motivo: verificacion.motivo,
        mensaje: verificacion.mensaje,
        por: 'sistema',
      });
      return;
    }

    // No cruzó → `observada` CON MOTIVO. Nunca rechazo: el registro es un
    // corte con fecha y un prestador habilitado ayer no está en él.
    //
    // El motivo se anota como `observacion` además de viajar en la transición:
    // `GET /afiliacion/:id/estado` lee las observaciones para decir QUÉ falta,
    // y una organización observada sin explicación es exactamente la respuesta
    // muda que prohíbe la regla 3.
    this.mover(registro, 'observada', 'sistema', verificacion.mensaje);
    this.anotar(registro, {
      tipo: 'observacion',
      motivo: verificacion.motivo,
      mensaje: verificacion.mensaje,
      por: 'sistema',
    });
    for (const falta of verificacion.falta) {
      this.anotar(registro, {
        tipo: 'observacion',
        motivo: verificacion.motivo,
        mensaje: `Falta: ${falta}`,
        por: 'sistema',
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Máquina de estados y consulta
  // ═══════════════════════════════════════════════════════════════

  /**
   * Aplica una transición pedida por un humano. Ilegal →
   * `PULSO_ILLEGAL_TRANSITION`.
   */
  transicionar(
    id: string,
    hacia: EstadoAfiliacion,
    por: string,
    motivo?: string,
  ): Organizacion {
    const registro = this.exigirRegistro(id);
    this.mover(registro, hacia, por, motivo ?? `Transición a "${hacia}".`);

    // Aprobar a mano es verificación manual: quien la aprobó queda en el
    // evento, y `verificacion` deja de decir "pendiente".
    if (
      hacia === 'aprobada' &&
      registro.organizacion.verificacion === 'pendiente'
    ) {
      registro.organizacion.verificacion = 'manual';
      registro.organizacion.verificadaEn = new Date().toISOString();
    }
    return registro.organizacion;
  }

  obtener(id: string): Organizacion {
    return this.exigirRegistro(id).organizacion;
  }

  estado(id: string): EstadoAfiliacionResponse {
    const registro = this.exigirRegistro(id);
    const organizacion = registro.organizacion;

    return {
      id: organizacion.id,
      estado: organizacion.estado,
      verificacion: organizacion.verificacion,
      despachable: esDespachable(organizacion),
      observaciones: registro.eventos
        .filter((e) => e.tipo === 'observacion')
        .map((e) => e.mensaje),
      transicionesPosibles: [...transicionesValidas(organizacion.estado)],
    };
  }

  /** La auditoría, en orden. Append-only: solo se lee. */
  eventos(id: string): EventoAfiliacion[] {
    return [...this.exigirRegistro(id).eventos];
  }

  listar(estado?: EstadoAfiliacion): Organizacion[] {
    const todas = [...this.registros.values()].map((r) => r.organizacion);
    const filtradas = estado ? todas.filter((o) => o.estado === estado) : todas;
    return filtradas.sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
  }

  /**
   * Las organizaciones que el ranking podría despachar hoy.
   *
   * Existe para que el filtro de la tarea de ruteo tenga a quién preguntarle
   * y no reimplemente el predicado. Ver la advertencia en
   * `estados.ts::esDespachable`: enchufarlo hoy vaciaría el ranking.
   */
  despachables(): Organizacion[] {
    return this.listar().filter(esDespachable);
  }

  // ── Internos ───────────────────────────────────────────────────

  /** El único sitio donde cambia `estado`. Todo lo demás lo llama. */
  private mover(
    registro: RegistroInterno,
    hacia: EstadoAfiliacion,
    por: string,
    mensaje: string,
  ): void {
    const desde = registro.organizacion.estado;
    exigirTransicion(desde, hacia);

    registro.organizacion.estado = hacia;
    registro.organizacion.actualizadaEn = new Date().toISOString();
    this.anotar(registro, {
      tipo: 'transicion',
      de: desde,
      a: hacia,
      mensaje,
      por,
    });
  }

  /** Append-only: `push` y nada más. Aquí no hay update ni delete. */
  private anotar(
    registro: RegistroInterno,
    evento: Omit<EventoAfiliacion, 'organizacionId' | 'ts'>,
  ): void {
    registro.eventos.push({
      organizacionId: registro.organizacion.id,
      ts: new Date().toISOString(),
      ...evento,
    });
  }

  private exigirRegistro(id: string): RegistroInterno {
    const registro = this.registros.get(id);
    if (!registro) {
      throw new PulsoError(
        'PULSO_INVALID_INPUT',
        `No existe la afiliación ${id}.`,
      );
    }
    return registro;
  }

  private exigir(condicion: boolean, mensaje: string): void {
    if (!condicion) throw new PulsoError('PULSO_INVALID_INPUT', mensaje);
  }

  private fuente(): FuenteVerificacion {
    return this.supabase.disponible() ? 'supabase' : 'catalogo_compilado';
  }

  private siguientePaso(estado: EstadoAfiliacion): string {
    switch (estado) {
      case 'aprobada':
        return 'Confirma los datos precargados y activa la organización para entrar al ruteo.';
      case 'observada':
        return 'Completa lo que falta y vuelve a enviar la solicitud.';
      case 'en_verificacion':
        return 'La plataforma la está revisando. Máximo declarado: 24 h hábiles.';
      case 'activa':
        return 'Ya recibe solicitudes de ruteo.';
      default:
        return 'Completa la solicitud y envíala.';
    }
  }

  /**
   * Revisa la forma del NIT.
   *
   * `bloqueo` corta el flujo: sin NIT, o con un número que no puede ser un
   * NIT, no hay nada que verificar. El dígito de verificación es otra cosa —
   * NO bloquea. Un dígito transpuesto no es un impostor, y cortar ahí le
   * negaría al afiliado la precarga que sí podemos darle. Lo que hace es
   * impedir la aprobación automática: el NIT es la identidad legal y no se
   * cruza contra ningún registro, así que uno que no cuadra consigo mismo
   * tiene que pasar por ojos humanos.
   */
  private revisarNit(
    nit: string | undefined,
    fuente: FuenteVerificacion,
  ): { bloqueo?: VerificacionAfiliacion; dvSospechoso: boolean } {
    const digitos = soloDigitos(nit);

    if (!digitos) {
      return {
        dvSospechoso: false,
        bloqueo: {
          encontrada: false,
          requiereRevision: false,
          motivo: 'nit_faltante',
          mensaje: 'Falta el NIT de la organización.',
          falta: ['NIT con dígito de verificación'],
          fuente,
        },
      };
    }

    if (digitos.length < 8 || digitos.length > 11) {
      return {
        dvSospechoso: false,
        bloqueo: {
          encontrada: false,
          requiereRevision: false,
          motivo: 'nit_formato_invalido',
          mensaje:
            `Un NIT colombiano tiene entre 8 y 10 dígitos más el de ` +
            `verificación; este trae ${digitos.length}.`,
          falta: ['NIT con dígito de verificación'],
          fuente,
        },
      };
    }

    return { dvSospechoso: !digitoVerificacionCuadra(digitos) };
  }

  /**
   * Degrada una verificación limpia cuando el NIT no cuadra consigo mismo.
   *
   * Se suma al resultado en vez de reemplazarlo: la precarga del REPS sigue
   * saliendo — es lo que hace útil la pantalla — pero la afiliación ya no
   * puede aprobarse sola.
   */
  private conNitSospechoso(
    resultado: VerificacionAfiliacion,
    dvSospechoso: boolean,
  ): VerificacionAfiliacion {
    if (!dvSospechoso) return resultado;

    return {
      ...resultado,
      requiereRevision: true,
      motivo: resultado.motivo ?? 'nit_digito_verificacion_no_cuadra',
      mensaje:
        `${resultado.mensaje} Además, el dígito de verificación del NIT no ` +
        `cuadra con el número: suele ser un dígito transpuesto al escribirlo.`,
      falta: [...resultado.falta, 'NIT correcto con su dígito de verificación'],
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// Funciones puras
// ─────────────────────────────────────────────────────────────────

function soloDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '');
}

/**
 * Precarga: lo que el REPS ya sabe y el afiliado no tiene que tipear.
 *
 * Lista blanca campo por campo, igual que `estado.service.ts::despojar()`. Si
 * alguien agrega un campo a `Sede`, esto deja de compilar y **tiene que
 * decidir** si ese dato sale hacia un endpoint público. Con un rest spread
 * entraría solo y en silencio.
 */
function precargar(sede: Sede): PrecargaSede {
  return {
    codigo: sede.codigo,
    nombre: sede.nombre,
    direccion: sede.direccion,
    localidad: sede.localidad,
    coord: sede.coord,
    naturaleza: sede.naturaleza,
    complejidad: sede.complejidad,
    telefono: sede.telefono,
    servicios: sede.servicios,
    camas: sede.camas,
  };
}

/** Igual: se nombra lo que sale. Correo, teléfono y hash se quedan dentro. */
function despojarActor(actor: RegistroInterno['actor']): ActorPublico {
  return {
    id: actor.id,
    organizacionId: actor.organizacionId,
    tipo: actor.tipo,
    nombre: actor.nombre,
    roles: actor.roles,
    sedes: actor.sedes,
    activo: actor.activo,
    creadoEn: actor.creadoEn,
  };
}

/**
 * scrypt con sal por actor, formato `scrypt$<sal>$<hash>`.
 *
 * La contraseña del alta se guarda hasheada o no se guarda: en claro sería la
 * misma falla que la contraseña compartida que la tarea 1.3 viene a matar.
 * **Quien verifica el login es 1.3**, no este módulo — aquí solo se recibe la
 * credencial y se deja irreversible.
 */
function hashearPassword(password: string): string {
  const sal = randomBytes(16);
  const derivada = scryptSync(password, sal, 32);
  return `scrypt$${sal.toString('base64')}$${derivada.toString('base64')}`;
}

/**
 * Dígito de verificación del NIT (DIAN): pesos fijos por posición desde la
 * derecha, suma módulo 11.
 */
function digitoVerificacionCuadra(digitos: string): boolean {
  const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

  const base = digitos.slice(0, -1);
  const dv = Number(digitos.slice(-1));

  let suma = 0;
  for (let i = 0; i < base.length; i++) {
    suma += Number(base[base.length - 1 - i]) * PESOS[i];
  }

  const resto = suma % 11;
  return dv === (resto > 1 ? 11 - resto : resto);
}
