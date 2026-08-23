/**
 * Tipos del módulo de afiliación (tareas 2.1 y 2.9).
 *
 * ── POR QUÉ VIVEN AQUÍ Y NO EN `contracts/types.ts` ───────────────
 * El Anexo B de `docs/pulso-plataforma-afiliacion-y-tramites.md` los destina
 * al contrato compartido, pero ese archivo tiene dueño por ola y su espejo
 * manual (`apps/frontend/lib/types.ts`) se verifica en CI con
 * `scripts/verificar-tipos.mts`: cambiar uno solo no rompe el build, rompe el
 * runtime. Mientras el dueño de tipos de la ola 2 no los mueva, viven aquí y
 * el front los consume por la forma del JSON, no por el import.
 *
 * Cuando se muevan, esta es la lista literal a copiar. Nada más de este
 * directorio pertenece al contrato.
 *
 * Identificadores sin tildes (regla 7 de AGENTS.md); las tildes solo aparecen
 * en los textos que lee un humano.
 */

import type {
  CamaSede,
  CodServicio,
  Complejidad,
  Coordenada,
} from '../contracts/types';

// ─────────────────────────────────────────────────────────────────
// Vocabulario
// ─────────────────────────────────────────────────────────────────

export type TipoOrganizacion =
  'ips' | 'operador_ambulancia' | 'crue' | 'entidad_pagadora';

/** Los ocho estados de §3.2. La máquina que los conecta vive en `estados.ts`. */
export type EstadoAfiliacion =
  | 'borrador'
  | 'enviada'
  | 'en_verificacion'
  | 'observada'
  | 'aprobada'
  | 'activa'
  | 'suspendida'
  | 'retirada';

/**
 * Cómo se verificó la organización.
 *   reps_automatico — cruzó sola contra el REPS. Es el camino sin trámite.
 *   manual          — la aprobó un humano de `admin_plataforma`.
 *   pendiente       — todavía nadie decidió.
 */
export type MetodoVerificacion = 'reps_automatico' | 'manual' | 'pendiente';

export type RolAfiliacion =
  | 'paramedico'
  | 'jefe_urgencias'
  | 'admin_organizacion'
  | 'regulador_crue'
  | 'auditor'
  | 'admin_plataforma'
  | 'servicio';

/**
 * De dónde salió el dato con el que se verificó.
 *
 * Regla 2 de AGENTS.md: todo degrada sin credenciales **y lo dice**. Sin
 * Supabase el cruce se hace contra el catálogo compilado del repo (84 sedes de
 * urgencias, 225 operadores) en vez de contra las 16.181 sedes del REPS. Un
 * "no encontrada" significa cosas MUY distintas en cada modo, así que el modo
 * viaja en la respuesta y no solo en `GET /capacidades`.
 */
export type FuenteVerificacion = 'supabase' | 'catalogo_compilado';

/**
 * Por qué no cruzó, o por qué necesita ojos humanos.
 *
 * Es un código estable, no una frase: el front decide con él y la frase
 * (`mensaje`) puede cambiar sin romper a nadie. Regla 3 de AGENTS.md — el
 * conjunto vacío es un evento: nunca se devuelve `encontrada:false` pelado.
 */
export type MotivoVerificacion =
  // ── forma de la solicitud ──
  | 'nit_faltante'
  | 'nit_formato_invalido'
  | 'nit_digito_verificacion_no_cuadra'
  | 'codigo_habilitacion_faltante'
  | 'codigo_habilitacion_no_numerico'
  | 'codigo_es_de_prestador_no_de_sede'
  | 'codigo_habilitacion_longitud_invalida'
  // ── el cruce en sí ──
  | 'sede_fuera_del_catalogo_cargado'
  | 'nombre_no_coincide_con_reps'
  | 'sin_razon_social_para_contrastar'
  | 'operador_fuera_del_registro_de_transporte'
  | 'operador_sin_marca_tab_ni_tam'
  | 'tipo_sin_fuente_automatica';

// ─────────────────────────────────────────────────────────────────
// Catálogo de operadores de ambulancia (tarea 2.9)
// ─────────────────────────────────────────────────────────────────

/**
 * Una fila del registro de transporte especial de pacientes.
 * La llena `catalogo-ambulancias.generado.ts`.
 */
export interface OperadorAmbulancia {
  /** Razón social del prestador, tal como la publica la Secretaría. */
  prestador: string;
  /** Nombre comercial de la sede. A veces es igual al del prestador. */
  sede: string;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
  /**
   * null en las 225 filas de hoy: la fuente no publica NIT. El campo existe
   * porque el cruce por NIT es el camino preferido y no queremos cambiar la
   * lógica el día que se publique.
   */
  nit: string | null;
  /** Transporte Asistencial Básico. Columna BASICO del CSV. */
  tab: boolean;
  /** Transporte Asistencial Medicalizado. Columna MEDICALIZADO del CSV. */
  tam: boolean;
  /** El prestador aparece además con servicio de urgencias (es una IPS). */
  urgencias: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Verificación
// ─────────────────────────────────────────────────────────────────

export interface VerificarAfiliacionRequest {
  tipo: TipoOrganizacion;
  /** 12 dígitos. Obligatorio para `ips`, opcional para el resto. */
  codigoHabilitacion?: string;
  nit: string;
  /**
   * Contra qué se contrasta el nombre del REPS. Opcional porque la pantalla
   * de §3.4 pide primero el código; sin ella no se puede afirmar identidad y
   * la verificación sale `requiereRevision`.
   */
  razonSocial?: string;
}

/** Lo que el REPS ya sabe de la sede y el afiliado NO tiene que tipear. */
export interface PrecargaSede {
  codigo: string;
  nombre: string;
  direccion: string;
  localidad: string | null;
  coord: Coordenada;
  naturaleza: 'Pública' | 'Privada' | 'Mixta';
  complejidad: Complejidad;
  telefono: string | null;
  servicios: CodServicio[];
  camas: CamaSede[];
}

/** Lo mismo para un operador de ambulancias. */
export interface PrecargaOperador {
  prestador: string;
  sede: string;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
  /**
   * La marca del registro. Es la que después alimenta `movil.tipo` en el alta
   * de flota (tarea 3.6): un operador sin TAM no puede declarar móviles TAM.
   */
  tipos: ('TAB' | 'TAM')[];
  /**
   * true cuando el registro no le marca ni TAB ni TAM (101 de 225 filas: son
   * IPS que aparecen ahí solo por su servicio de urgencias). Cruzó, pero la
   * flota hay que declararla a mano.
   */
  requiereDeclararFlota: boolean;
}

export interface VerificacionAfiliacion {
  encontrada: boolean;
  /** true cuando cruzó pero un humano tiene que mirarlo antes de aprobar. */
  requiereRevision: boolean;
  /** Presente siempre que `encontrada` sea false o `requiereRevision` true. */
  motivo?: MotivoVerificacion;
  /** El mismo motivo, en una frase que se le puede mostrar a una persona. */
  mensaje: string;
  /** Qué le falta a la solicitud para cruzar. Vacío si no falta nada. */
  falta: string[];
  /** Similitud 0..1 del nombre contra el registro. undefined si no se comparó. */
  coincidencia?: number;
  precargaSede?: PrecargaSede;
  precargaOperador?: PrecargaOperador;
  /** El nombre que sí está en el registro, cuando ayuda a corregir el tipeo. */
  sugerencia?: string;
  fuente: FuenteVerificacion;
}

// ─────────────────────────────────────────────────────────────────
// Alta
// ─────────────────────────────────────────────────────────────────

export interface AdminSolicitado {
  nombre: string;
  correo: string;
  /** Opcional: la verificación de credenciales es de la tarea 1.3. */
  password?: string;
  telefono?: string;
  registroProfesional?: string;
}

export interface CrearAfiliacionRequest {
  tipo: TipoOrganizacion;
  nit: string;
  razonSocial: string;
  nombreCorto?: string;
  /** Códigos de habilitación de sede (12 dígitos). Vacío para operadores. */
  sedes?: string[];
  admin: AdminSolicitado;
}

/** El vínculo organización ↔ sede REPS. */
export interface SedeAfiliada {
  codigoSede: string;
  /** true si el código existía en el catálogo al momento de afiliar. */
  verificada: boolean;
  activa: boolean;
  vinculadaEn: string;
}

/**
 * La organización tal como sale del servidor.
 *
 * Lista blanca escrita campo por campo, igual que `estado.service.ts::despojar()`:
 * el correo y el teléfono del admin, y el hash de su contraseña, NO están aquí
 * y no pueden colarse por un rest spread.
 */
export interface Organizacion {
  id: string;
  tipo: TipoOrganizacion;
  razonSocial: string;
  nombreCorto: string | null;
  nit: string;
  estado: EstadoAfiliacion;
  verificacion: MetodoVerificacion;
  verificadaEn: string | null;
  sedes: SedeAfiliada[];
  creadaEn: string;
  actualizadaEn: string;
}

/** El actor, sin PII de contacto. Ver el comentario de `Organizacion`. */
export interface ActorPublico {
  id: string;
  organizacionId: string;
  tipo: 'humano' | 'servicio';
  nombre: string;
  roles: RolAfiliacion[];
  sedes: string[];
  activo: boolean;
  creadoEn: string;
}

/**
 * Un renglón de la auditoría de la afiliación. Append-only (regla 4): nadie
 * edita ni borra; corregir es escribir otro evento.
 */
export interface EventoAfiliacion {
  organizacionId: string;
  ts: string;
  tipo: 'transicion' | 'verificacion' | 'observacion';
  de?: EstadoAfiliacion;
  a?: EstadoAfiliacion;
  motivo?: MotivoVerificacion | string;
  mensaje: string;
  /** Quién lo hizo: 'sistema' o el id del actor. Nunca un correo. */
  por: string;
}

export interface CrearAfiliacionResponse {
  organizacion: Organizacion;
  actor: ActorPublico;
  verificacion: VerificacionAfiliacion;
  /** Qué tiene que pasar ahora, en una frase. */
  siguientePaso: string;
  /** true si el NIT ya estaba afiliado y esto devolvió lo que ya existía. */
  yaExistia: boolean;
}

export interface EstadoAfiliacionResponse {
  id: string;
  estado: EstadoAfiliacion;
  verificacion: MetodoVerificacion;
  /** El predicado del ranking. Solo `activa` es true. */
  despachable: boolean;
  /** Lo que falta, en frases. Vacío cuando no falta nada. */
  observaciones: string[];
  /** A dónde puede ir desde aquí. La UI pinta botones con esto. */
  transicionesPosibles: EstadoAfiliacion[];
}

export interface TransicionRequest {
  a: EstadoAfiliacion;
  motivo?: string;
}
