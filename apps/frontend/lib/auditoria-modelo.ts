/**
 * El modelo del expediente forense, sin React.
 *
 * Mismo patrón que `sesion-modelo.ts`: aquí está la lógica que decide **qué
 * se ve y cómo se lee** —el orden de la línea de tiempo, qué evento corrige a
 * cuál, qué se redacta por rol, quién es persona y quién es servicio— y eso
 * hay que poder probarlo. `node --test lib/auditoria-modelo.test.mts` lo corre
 * tal cual porque este archivo no importa React ni `api.ts`.
 *
 * ⚠️ LA AUTORIDAD ES EL SERVIDOR. La redacción de verdad la hace core
 * (`auditoria/redaccion.ts`) antes de mandar nada; lo de aquí es la misma
 * tabla, duplicada a propósito, para dos cosas: rotular la pantalla ("qué se
 * te está ocultando y por qué") y no pintar un campo sensible si algún día el
 * servidor se distrae. Si las dos difieren, la que manda es la del servidor —
 * la de aquí es defensa en profundidad, no la puerta.
 *
 * Los tipos son el espejo de `core/src/auditoria/auditoria.tipos.ts`. NO van
 * en `lib/types.ts`: ese archivo es el espejo del contrato compartido entre
 * los cuatro carriles y tiene un test que se pone rojo si diverge. Esto es el
 * contrato de un módulo.
 */

// ── Espejo de core/src/auditoria/auditoria.tipos.ts ──────────────

export type TipoActor = "humano" | "servicio" | "sistema";

export interface ActorExpediente {
  id: string | null;
  nombre: string | null;
  tipo: TipoActor;
}

export type FuenteFila = "evento_caso" | "pulso_routing_decision_audit";

export interface FilaExpediente {
  clave: string;
  fuente: FuenteFila;
  eventoId: number | null;
  /** null cuando la fuente no sella hora. No se inventa. */
  ocurridoEn: string | null;
  tipo: string;
  actor: ActorExpediente;
  organizacionId: string | null;
  codigoSede: string | null;
  movilId: string | null;
  detalle: Record<string, unknown>;
  corrigeA: number | null;
  redactados: string[];
}

export interface EvidenciaExpediente {
  estado: "matched" | "escalated_to_crue";
  modelVersion: string | null;
  configVersion: string | null;
  selectedDestination: string | null;
  etaProvenance: string | null;
  minuteBreakdown: Record<string, number>;
  fingerprint: string | null;
  inputs: unknown;
  candidates: unknown[];
}

export interface ExpedienteCaso {
  casoId: string;
  generadoEn: string;
  solicitante: {
    id: string;
    tipo: TipoActor;
    roles: string[];
    organizacionId: string | null;
    rolEfectivo: string;
    identidadProvisional: boolean;
  };
  politicaRedaccion: { rol: string; claves: string[]; motivo: string };
  filas: FilaExpediente[];
  evidencia: EvidenciaExpediente | null;
  registro: { modo: "memoria" | "postgres"; advertencia: string | null };
  cobertura: { tiposCableados: string[]; nota: string };
}

export const MARCA_REDACTADO = "[redactado]";

// ── Cómo se lee cada tipo ────────────────────────────────────────

export const ETIQUETA_TIPO: Record<string, string> = {
  caso_creado: "caso creado",
  revision_humana: "revisión humana",
  match_calculado: "ranking calculado",
  despachado: "solicitud enviada",
  aceptado: "sede aceptó",
  rechazado: "sede rechazó",
  timeout: "solicitud vencida",
  rerouteado: "re-ruteado",
  escalado: "escalado al CRUE",
  override_crue: "override del CRUE",
  llegada_escena: "llegada a la escena",
  salida_escena: "salida de la escena",
  llegada_puerta: "llegada a puerta",
  entrega: "entrega del paciente",
  cerrado: "caso cerrado",
  demora_reportada: "demora reportada",
  prearribo_enviado: "prearribo enviado",
  preparacion_confirmada: "preparación confirmada",
  derechos_verificados: "derechos verificados",
  tramite_generado: "trámite generado",
  contrarreferencia: "contrarreferencia",
  lectura_auditoria: "consulta de auditoría",
};

export function etiquetaTipo(tipo: string): string {
  return ETIQUETA_TIPO[tipo] ?? tipo.replaceAll("_", " ");
}

/**
 * Los tipos que NO son un hecho del traslado sino una consulta al expediente.
 *
 * Se muestran igual —el acceso es parte del acta— pero la pantalla los separa
 * para que la historia clínica del caso no quede sepultada bajo las visitas.
 */
export function esConsulta(tipo: string): boolean {
  return tipo === "lectura_auditoria";
}

// ── Actor: persona, servicio o máquina ───────────────────────────

/**
 * Cómo se nombra a quien actuó.
 *
 * `svc:voz` no es una persona y la pantalla no puede dejar que lo parezca:
 * "el paramédico confirmó la llegada" y "un servicio interpretó un audio como
 * confirmación de llegada" son dos hechos distintos ante un juez.
 */
export function etiquetaActor(actor: ActorExpediente): string {
  const nombre = actor.nombre?.trim() || actor.id || "sin actor";
  if (actor.tipo === "servicio") return `${nombre} · servicio automático`;
  if (actor.tipo === "sistema") return `${nombre} · decisión del sistema`;
  return nombre;
}

/** Marca corta para la línea de tiempo y para el PDF en blanco y negro. */
export function marcaActor(actor: ActorExpediente): string {
  return actor.tipo === "humano" ? "PERSONA" : actor.tipo === "servicio" ? "SERVICIO" : "SISTEMA";
}

export function esHumano(actor: ActorExpediente): boolean {
  return actor.tipo === "humano";
}

// ── Orden de la línea de tiempo ──────────────────────────────────

/**
 * Cronológico ascendente, con dos decisiones que importan:
 *
 *   · Las filas SIN hora van primero, no al final. Hoy la única es la
 *     evidencia del ruteo reconstruida desde `pulso_routing_decision_audit`,
 *     que por fuerza ocurrió antes de que alguien despachara. Ponerla al
 *     final contaría la historia al revés.
 *   · Empate a la misma hora se rompe por `eventoId`. Sin eso, dos lecturas
 *     del mismo caso podrían salir en orden distinto, y una auditoría que no
 *     es reproducible no sirve para nada.
 */
export function ordenarLinea(filas: FilaExpediente[]): FilaExpediente[] {
  return [...filas].sort((a, b) => {
    if (a.ocurridoEn === null && b.ocurridoEn === null) {
      return a.clave.localeCompare(b.clave);
    }
    if (a.ocurridoEn === null) return -1;
    if (b.ocurridoEn === null) return 1;
    if (a.ocurridoEn !== b.ocurridoEn) {
      return a.ocurridoEn.localeCompare(b.ocurridoEn);
    }
    return (a.eventoId ?? 0) - (b.eventoId ?? 0);
  });
}

// ── Correcciones ─────────────────────────────────────────────────

export interface FilaEnlazada extends FilaExpediente {
  /** true si esta fila corrige a otra. */
  esCorreccion: boolean;
  /** Ids de las filas que corrigen a esta. Vacío = nadie la corrigió. */
  corregidaPor: number[];
  /** true si alguien la corrigió después. Se muestra, no se borra. */
  obsoleta: boolean;
}

/**
 * Ata cada corrección con lo que corrige, en los dos sentidos.
 *
 * **El error se ve, no se esconde**: la fila corregida se queda en la línea
 * de tiempo marcada como obsoleta, con un puntero a la que la enmienda. Un
 * `UPDATE` habría borrado el error, que es justo lo que un auditor necesita
 * mirar.
 *
 * Una corrección que apunta a un evento que no está en el expediente (porque
 * la redacción o el alcance lo dejaron fuera) sigue marcada como corrección:
 * decir "esto enmienda algo que no puedes ver" es más honesto que pintarla
 * como un evento suelto.
 */
export function enlazarCorrecciones(filas: FilaExpediente[]): FilaEnlazada[] {
  const correcciones = new Map<number, number[]>();
  for (const fila of filas) {
    if (fila.corrigeA == null || fila.eventoId == null) continue;
    correcciones.set(fila.corrigeA, [
      ...(correcciones.get(fila.corrigeA) ?? []),
      fila.eventoId,
    ]);
  }

  return filas.map((fila) => {
    const corregidaPor =
      fila.eventoId == null ? [] : (correcciones.get(fila.eventoId) ?? []);
    return {
      ...fila,
      esCorreccion: fila.corrigeA != null,
      corregidaPor,
      obsoleta: corregidaPor.length > 0,
    };
  });
}

/**
 * La frase que pide la tarea, literal:
 * "22:14 llegada a puerta — corregido a 22:11 por N. Robledo".
 *
 * La hora que se muestra es la que el evento DICE (`detalle.hora`), no la que
 * el servidor selló al recibirlo: corregir una llegada a las 22:19 significa
 * que la llegada fue a las 22:11, no que ocurriera al escribirla.
 */
export function textoCorreccion(
  original: FilaExpediente,
  correccion: FilaExpediente,
): string {
  return (
    `${horaDe(original)} ${etiquetaTipo(original.tipo)} — corregido a ` +
    `${horaDe(correccion)} por ${etiquetaActor(correccion.actor)}`
  );
}

/** `detalle.hora` si el evento la declara; si no, la hora del sello. */
export function horaDe(fila: FilaExpediente): string {
  const declarada = fila.detalle?.hora;
  if (typeof declarada === "string" && declarada.trim()) return declarada.trim();
  return horaCorta(fila.ocurridoEn);
}

/** HH:MM en 24 h, o un guion si no hay hora sellada. No se inventa una. */
export function horaCorta(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  return new Date(ms).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ── Redacción por rol (espejo del servidor) ──────────────────────

export const PII_ABSOLUTA = [
  "textoCrudo",
  "texto_crudo",
  "dictado",
  "texto",
  "origen",
  "telefono",
  "telefonoReporta",
  "telefono_reporta",
  "pacienteToken",
  "paciente_token",
];

export const NARRATIVA_CLINICA = [
  "resumen",
  "dxDescripcion",
  "signosAlarma",
  "edad",
  "sexo",
];

/**
 * Qué no ve cada rol, y por qué.
 *
 * Dos capas distintas y conviene no confundirlas:
 *   · PII absoluta — el dictado literal y dónde está el paciente NO salen del
 *     servidor para nadie, ni para el CRUE.
 *   · Narrativa clínica — el auditor externo audita el PROCESO: le sirven los
 *     códigos (triage, CIE-10, servicios REPS, minutos) y no le hace falta el
 *     relato del paciente, que además es texto libre transcrito de un dictado
 *     y por eso el sitio donde la PII se cuela sin que nadie la ponga ahí.
 */
export function politicaPorRol(rol: string): { claves: string[]; motivo: string } {
  return rol === "auditor"
    ? {
        claves: [...PII_ABSOLUTA, ...NARRATIVA_CLINICA],
        motivo:
          "Auditoría externa: se audita el proceso con los datos codificados.",
      }
    : {
        claves: [...PII_ABSOLUTA],
        motivo:
          "Actor operativo del caso: ve la narrativa clínica bajo la excepción de urgencia.",
      };
}

/** ¿Este campo ya viene tachado desde el servidor? */
export function estaRedactado(valor: unknown): boolean {
  return valor === MARCA_REDACTADO;
}

// ── Evidencia del ruteo ──────────────────────────────────────────

export interface CandidatoLegible {
  codigo: string;
  nombre: string;
  rank: number | null;
  etaMin: number | null;
  motivoDescarte: string | null;
  elegido: boolean;
}

/**
 * Aplana los candidatos de la evidencia a algo que una tabla pueda pintar.
 *
 * Tolerante a propósito: la evidencia es un `unknown[]` que guardó el motor
 * hace seis meses, con la forma que tenía entonces. Un expediente que revienta
 * porque a un candidato viejo le falta un campo es un expediente inútil justo
 * cuando más se necesita.
 */
export function candidatosDe(
  evidencia: EvidenciaExpediente | null,
): CandidatoLegible[] {
  if (!evidencia) return [];
  return evidencia.candidates.map((crudo) => {
    const c = (crudo ?? {}) as Record<string, unknown>;
    const sede = (c.sede ?? {}) as Record<string, unknown>;
    const codigo = texto(sede.codigo) ?? "—";
    return {
      codigo,
      nombre: texto(sede.nombre) ?? codigo,
      rank: numero(c.rank),
      etaMin: numero(c.etaMin),
      motivoDescarte: texto(c.motivoDescarte),
      elegido: codigo === evidencia.selectedDestination,
    };
  });
}

/** Los descartados, con su motivo. Son parte del producto, no ruido. */
export function descartadosDe(
  evidencia: EvidenciaExpediente | null,
): CandidatoLegible[] {
  return candidatosDe(evidencia).filter((c) => c.motivoDescarte !== null);
}

/**
 * El desglose, en minutos y ordenado por peso.
 *
 * En minutos porque es la decisión de diseño que hace que el ranking se
 * entienda sin explicación: "12 minutos de ruta más 3 de riesgo de rechazo".
 */
export function desgloseEnMinutos(
  evidencia: EvidenciaExpediente | null,
): { concepto: string; minutos: number }[] {
  if (!evidencia) return [];
  return Object.entries(evidencia.minuteBreakdown)
    .map(([concepto, minutos]) => ({ concepto, minutos: Number(minutos) || 0 }))
    .sort((a, b) => Math.abs(b.minutos) - Math.abs(a.minutos));
}

/**
 * De dónde salió el ETA, dicho en cristiano.
 *
 * Un ETA estimado por distancia en línea recta no vale lo mismo que uno con
 * tráfico real, y un expediente que no lo distingue deja creer que el sistema
 * sabía más de lo que sabía.
 */
export function procedenciaEta(evidencia: EvidenciaExpediente | null): string {
  if (!evidencia?.etaProvenance) return "sin registrar";
  return evidencia.etaProvenance === "mapbox"
    ? "Mapbox, con tráfico real"
    : evidencia.etaProvenance === "haversine_fallback"
      ? "estimado por distancia en línea recta (sin tráfico)"
      : evidencia.etaProvenance;
}

// ── Lectura defensiva de la respuesta ────────────────────────────

/**
 * Normaliza lo que vino del servidor.
 *
 * Un cuerpo que no se entiende es "no hay expediente", nunca "hay expediente a
 * medias": pintar media auditoría es peor que no pintarla, porque el hueco no
 * se ve. Los campos nuevos de un core más nuevo se ignoran sin romper nada.
 */
export function leerExpediente(crudo: unknown): ExpedienteCaso | null {
  if (crudo === null || typeof crudo !== "object") return null;
  const d = crudo as Record<string, unknown>;
  if (typeof d.casoId !== "string" || !Array.isArray(d.filas)) return null;

  const solicitante = (d.solicitante ?? {}) as Record<string, unknown>;
  const politica = (d.politicaRedaccion ?? {}) as Record<string, unknown>;
  const registro = (d.registro ?? {}) as Record<string, unknown>;
  const cobertura = (d.cobertura ?? {}) as Record<string, unknown>;

  return {
    casoId: d.casoId,
    generadoEn: texto(d.generadoEn) ?? new Date().toISOString(),
    solicitante: {
      id: texto(solicitante.id) ?? "desconocido",
      tipo: (texto(solicitante.tipo) as TipoActor) ?? "humano",
      roles: Array.isArray(solicitante.roles)
        ? solicitante.roles.filter((r): r is string => typeof r === "string")
        : [],
      organizacionId: texto(solicitante.organizacionId),
      rolEfectivo: texto(solicitante.rolEfectivo) ?? "",
      identidadProvisional: solicitante.identidadProvisional === true,
    },
    politicaRedaccion: {
      rol: texto(politica.rol) ?? "",
      claves: Array.isArray(politica.claves)
        ? politica.claves.filter((c): c is string => typeof c === "string")
        : [],
      motivo: texto(politica.motivo) ?? "",
    },
    filas: d.filas.map(leerFila),
    evidencia: leerEvidencia(d.evidencia),
    registro: {
      modo: registro.modo === "postgres" ? "postgres" : "memoria",
      advertencia: texto(registro.advertencia),
    },
    cobertura: {
      tiposCableados: Array.isArray(cobertura.tiposCableados)
        ? cobertura.tiposCableados.filter((t): t is string => typeof t === "string")
        : [],
      nota: texto(cobertura.nota) ?? "",
    },
  };
}

function leerFila(crudo: unknown): FilaExpediente {
  const f = (crudo ?? {}) as Record<string, unknown>;
  const actor = (f.actor ?? {}) as Record<string, unknown>;
  return {
    clave: texto(f.clave) ?? `fila:${Math.random().toString(36).slice(2)}`,
    fuente:
      f.fuente === "pulso_routing_decision_audit"
        ? "pulso_routing_decision_audit"
        : "evento_caso",
    eventoId: numero(f.eventoId),
    ocurridoEn: texto(f.ocurridoEn),
    tipo: texto(f.tipo) ?? "desconocido",
    actor: {
      id: texto(actor.id),
      nombre: texto(actor.nombre),
      tipo:
        actor.tipo === "servicio"
          ? "servicio"
          : actor.tipo === "sistema"
            ? "sistema"
            : "humano",
    },
    organizacionId: texto(f.organizacionId),
    codigoSede: texto(f.codigoSede),
    movilId: texto(f.movilId),
    detalle:
      f.detalle && typeof f.detalle === "object"
        ? (f.detalle as Record<string, unknown>)
        : {},
    corrigeA: numero(f.corrigeA),
    redactados: Array.isArray(f.redactados)
      ? f.redactados.filter((r): r is string => typeof r === "string")
      : [],
  };
}

function leerEvidencia(crudo: unknown): EvidenciaExpediente | null {
  if (crudo === null || typeof crudo !== "object") return null;
  const e = crudo as Record<string, unknown>;
  return {
    estado: e.estado === "escalated_to_crue" ? "escalated_to_crue" : "matched",
    modelVersion: texto(e.modelVersion),
    configVersion: texto(e.configVersion),
    selectedDestination: texto(e.selectedDestination),
    etaProvenance: texto(e.etaProvenance),
    minuteBreakdown:
      e.minuteBreakdown && typeof e.minuteBreakdown === "object"
        ? (e.minuteBreakdown as Record<string, number>)
        : {},
    fingerprint: texto(e.fingerprint),
    inputs: e.inputs ?? null,
    candidates: Array.isArray(e.candidates) ? e.candidates : [],
  };
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

// ── Exportación ──────────────────────────────────────────────────

/**
 * El JSON que se descarga.
 *
 * Es el expediente tal como llegó (ya redactado por el servidor) más quién lo
 * exportó y cuándo: un archivo suelto en el escritorio de alguien tiene que
 * poder decir de dónde salió.
 */
export function aJsonExportable(expediente: ExpedienteCaso): string {
  return JSON.stringify(
    {
      generadoPor: "PULSO · expediente forense",
      casoId: expediente.casoId,
      exportadoEn: new Date().toISOString(),
      leidoPor: expediente.solicitante,
      redaccion: expediente.politicaRedaccion,
      cobertura: expediente.cobertura,
      registro: expediente.registro,
      linea: ordenarLinea(expediente.filas),
      evidenciaRuteo: expediente.evidencia,
    },
    null,
    2,
  );
}

/** `pulso-expediente-<caso>-<fecha>.json`, sin PII en el nombre. */
export function nombreArchivo(casoId: string, extension: string): string {
  const marca = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "");
  return `pulso-expediente-${casoId.slice(0, 8)}-${marca}.${extension}`;
}
