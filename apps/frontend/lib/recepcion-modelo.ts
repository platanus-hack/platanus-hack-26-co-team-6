/**
 * El modelo del prearribo, sin React.
 *
 * Aquí está lo que la pantalla de pared de urgencias tiene que calcular bien:
 * cómo se compone el SBAR cuando la IA no lo produjo, de dónde sale cada ETA y
 * cómo se rotula, qué dicen los tres relojes y cuánto falta de preparación.
 * Todo eso se puede equivocar en silencio, así que vive fuera de los
 * componentes y tiene tests (`recepcion-modelo.test.mts`).
 *
 * REGLA DE IMPORTS: este archivo lo carga `node --test` con type stripping,
 * sin bundler. Por eso no importa NINGÚN módulo local en runtime —solo `zod`,
 * que es un paquete real— y todo lo del contrato entra como `import type`, que
 * el stripping borra. Es la misma restricción que respeta `sesion-modelo.ts`.
 *
 * REGLA DE HONESTIDAD (la del repo, aplicada aquí): este archivo **no inventa
 * clínica**. No hay tabla de diagnóstico → protocolo ni umbrales de ventana:
 * los fija el catálogo versionado del servidor (tareas 4.1 y 4.4). Si el
 * servidor no los manda, la vista dice que no los tiene. Duplicar 90 min de
 * door-to-balloon aquí sería repetir el error del prompt clínico duplicado en
 * Python y TypeScript que el repo ya arrastra.
 */

import { z } from "zod";
import type {
  CasoPublico,
  CodServicio,
  Complejidad,
  EstadoResponse,
  NivelTriage,
  Sexo,
  TipoMovil,
} from "./types";

// ─────────────────────────────────────────────────────────────────
// Piezas del paquete de prearribo
// ─────────────────────────────────────────────────────────────────

/**
 * De dónde salió lo que se está viendo.
 *
 *  recepcion  el paquete real de `GET /hospital/recepcion/:casoId` (tarea 4.1)
 *  estado     reconstruido en el cliente desde `GET /estado` porque 4.1 no está
 *
 * No es un detalle de implementación: cambia lo que la pantalla puede afirmar.
 * Un paquete reconstruido no tiene protocolo confirmado, ni ventana clínica, ni
 * checklist — y la vista lo dice en vez de dibujar huecos bonitos.
 */
export type FuenteRecepcion = "recepcion" | "estado";

/** Las cuatro líneas con las que un clínico entrega un paciente. */
export interface Sbar {
  situacion: string;
  antecedente: string;
  evaluacion: string;
  recomendacion: string;
}

/**
 *  llm              lo redactó el generador de SBAR (tarea 4.2)
 *  campos-del-caso  lo compuso esta vista con lo que ya trae el caso
 *
 * El segundo es peor redactado y **igual de correcto**: son los mismos campos
 * estructurados, sin una sola palabra inventada.
 */
export type MotorSbar = "llm" | "campos-del-caso";

export interface SbarConProcedencia {
  lineas: Sbar;
  motor: MotorSbar;
}

/** El protocolo lo resuelve una TABLA VERSIONADA en el servidor, nunca el front. */
export interface Protocolo {
  /** 'codigo_infarto' | 'codigo_acv' | 'trauma_mayor' | lo que traiga el catálogo. */
  codigo: string;
  /** Versión del catálogo con la que se resolvió. Va en la evidencia del caso. */
  version: string | null;
}

/**
 * Sólo rótulos para pantalla, como `NOMBRE_SERVICIO` en `presentacion.ts`.
 *
 * Lo que NO está aquí, y no puede estar, es qué diagnóstico activa qué
 * protocolo ni cuántos minutos dura su ventana: eso es criterio clínico
 * versionado y vive en el catálogo del servidor (4.4). Esto solo pone las
 * tildes que un identificador sin tildes no puede llevar.
 */
export const ETIQUETA_PROTOCOLO: Record<string, string> = {
  codigo_infarto: "CÓDIGO INFARTO",
  codigo_acv: "CÓDIGO ACV",
  trauma_mayor: "TRAUMA MAYOR",
};

export function etiquetaProtocolo(codigo: string): string {
  return ETIQUETA_PROTOCOLO[codigo] ?? codigo.replace(/_/g, " ").toUpperCase();
}

/**
 * De dónde sale el número de minutos que falta para que llegue la ambulancia.
 *
 *  vivo      de la posición del móvil (tarea 3.7). Sigue al vehículo.
 *  despacho  el que se calculó al despachar. Es una LÍNEA BASE, no un seguimiento.
 *  sin-dato  no hay ninguno de los dos.
 */
export type ProcedenciaEta = "vivo" | "despacho" | "sin-dato";

export interface Eta {
  /** Minutos al momento de medirlo. null si no hay ETA de ninguna clase. */
  minutos: number | null;
  procedencia: ProcedenciaEta;
  /** Cuándo se midió. Con procedencia 'despacho' es el instante del despacho. */
  medidoEn: string | null;
  /** Hora estimada de llegada en ISO. Contra esto cuenta el reloj de la cabecera. */
  llegadaEstimada: string | null;
}

/**
 * La ventana clínica. La fija el catálogo de protocolos (4.4), no esta vista.
 *
 * Cuenta desde el PRIMER CONTACTO MÉDICO, no desde la llegada al hospital: por
 * eso `inicioEn` viaja y no se asume "ahora".
 */
export interface VentanaClinica {
  minutos: number;
  /** "Door-to-balloon", "Door-to-needle"… tal cual lo nombra el catálogo. */
  nombre: string;
  inicioEn: string;
  version: string | null;
}

export interface ItemChecklist {
  id: string;
  etiqueta: string;
  /** "Enfermera jefe", "Hemodinamista"… quién debería confirmarlo. */
  responsable: string | null;
  confirmado: boolean;
  /** Nombre del actor que confirmó. Sin actor no hay confirmación válida. */
  confirmadoPor: string | null;
  confirmadoEn: string | null;
}

export interface ResumenPaciente {
  edad: number | null;
  sexo: Sexo;
  triage: NivelTriage;
  dxCie10: string | null;
  dxDescripcion: string;
  serviciosRequeridos: CodServicio[];
  signosAlarma: string[];
  complejidadRequerida: Complejidad;
  requiereMedicoABordo: boolean;
}

/**
 * Todo lo que la pantalla de prearribo necesita, venga de donde venga.
 *
 * NO LLEVA `textoCrudo` NI `origen`, y no es un olvido: `CasoPublico` los
 * excluye a propósito y `despojar()` en core deja de compilar si alguien los
 * agrega. El dictado literal del paramédico no se pinta en una pantalla que
 * cuelga de la pared de urgencias, a la vista de quien pase por el pasillo.
 */
export interface PaqueteRecepcion {
  fuente: FuenteRecepcion;
  casoId: string;
  /** Sede que tiene que preparar. null = todavía nadie aceptó el traslado. */
  sedeCodigo: string | null;
  sedeNombre: string | null;
  protocolo: Protocolo | null;
  sbar: SbarConProcedencia | null;
  checklist: ItemChecklist[];
  eta: Eta;
  ventana: VentanaClinica | null;
  paciente: ResumenPaciente;
  movil: { id: string; tipo: TipoMovil } | null;
  aceptadoEn: string | null;
  actualizadoEn: string;
}

// ─────────────────────────────────────────────────────────────────
// Lo que responde core (tarea 4.1) — lectura tolerante
// ─────────────────────────────────────────────────────────────────

/**
 * Todo opcional salvo `casoId`, igual que en `sesion-modelo.ts`: si core
 * empieza a mandar campos nuevos esto no revienta, y si todavía no manda los
 * de aquí tampoco. Un cuerpo que no se entiende devuelve `null` y la vista cae
 * al camino degradado en vez de pintar un paquete a medias.
 */
const esquemaSbar = z.object({
  situacion: z.string(),
  antecedente: z.string(),
  evaluacion: z.string(),
  recomendacion: z.string(),
});

const esquemaItem = z.object({
  id: z.string(),
  etiqueta: z.string(),
  responsable: z.string().nullish(),
  confirmado: z.boolean().nullish(),
  confirmadoPor: z.string().nullish(),
  confirmadoEn: z.string().nullish(),
});

const esquemaPaciente = z.object({
  edad: z.number().nullish(),
  sexo: z.enum(["M", "F", "desconocido"]).nullish(),
  triage: z.number().nullish(),
  dxCie10: z.string().nullish(),
  dxDescripcion: z.string().nullish(),
  serviciosRequeridos: z.array(z.number()).nullish(),
  signosAlarma: z.array(z.string()).nullish(),
  complejidadRequerida: z.enum(["baja", "media", "alta"]).nullish(),
  requiereMedicoABordo: z.boolean().nullish(),
});

export const esquemaPaqueteRecepcion = z.object({
  casoId: z.string(),
  sedeCodigo: z.string().nullish(),
  sedeNombre: z.string().nullish(),
  protocolo: z.string().nullish(),
  protocoloVersion: z.string().nullish(),
  sbar: esquemaSbar.nullish(),
  sbarMotor: z.enum(["llm", "campos-del-caso"]).nullish(),
  checklist: z.array(esquemaItem).nullish(),
  etaMin: z.number().nullish(),
  etaProcedencia: z.enum(["vivo", "despacho", "sin-dato"]).nullish(),
  etaMedidoEn: z.string().nullish(),
  llegadaEstimada: z.string().nullish(),
  ventanaClinicaMin: z.number().nullish(),
  ventanaNombre: z.string().nullish(),
  ventanaInicioEn: z.string().nullish(),
  paciente: esquemaPaciente.nullish(),
  movil: z.object({ id: z.string(), tipo: z.enum(["TAB", "TAM"]) }).nullish(),
  aceptadoEn: z.string().nullish(),
  actualizadoEn: z.string().nullish(),
});

const PACIENTE_VACIO: ResumenPaciente = {
  edad: null,
  sexo: "desconocido",
  triage: 3,
  dxCie10: null,
  dxDescripcion: "Sin diagnóstico registrado",
  serviciosRequeridos: [],
  signosAlarma: [],
  complejidadRequerida: "media",
  requiereMedicoABordo: false,
};

/** Triage fuera de 1..5 se descarta: prefiero "no sé" a un nivel inventado. */
function nivelTriage(valor: number | null | undefined): NivelTriage {
  return valor === 1 || valor === 2 || valor === 3 || valor === 4 || valor === 5
    ? valor
    : PACIENTE_VACIO.triage;
}

export function normalizarPaquete(
  crudo: unknown,
  ahora = Date.now(),
): PaqueteRecepcion | null {
  const leido = esquemaPaqueteRecepcion.safeParse(crudo);
  if (!leido.success) return null;

  const d = leido.data;
  const p = d.paciente ?? {};

  // Sin `etaProcedencia` explícita pero con minutos, lo más honesto es NO
  // asumir que es en vivo: un ETA sin procedencia declarada se trata como el
  // del despacho, que es la afirmación más débil de las dos.
  const procedencia: ProcedenciaEta =
    d.etaProcedencia ?? (d.etaMin != null ? "despacho" : "sin-dato");

  return {
    fuente: "recepcion",
    casoId: d.casoId,
    sedeCodigo: d.sedeCodigo ?? null,
    sedeNombre: d.sedeNombre ?? null,
    protocolo: d.protocolo
      ? { codigo: d.protocolo, version: d.protocoloVersion ?? null }
      : null,
    sbar: d.sbar
      ? { lineas: d.sbar, motor: d.sbarMotor ?? "llm" }
      : null,
    checklist: (d.checklist ?? []).map((i) => ({
      id: i.id,
      etiqueta: i.etiqueta,
      responsable: i.responsable ?? null,
      confirmado: i.confirmado ?? false,
      confirmadoPor: i.confirmadoPor ?? null,
      confirmadoEn: i.confirmadoEn ?? null,
    })),
    eta: {
      minutos: d.etaMin ?? null,
      procedencia,
      medidoEn: d.etaMedidoEn ?? null,
      llegadaEstimada:
        d.llegadaEstimada ??
        proyectarLlegada(d.etaMin ?? null, d.etaMedidoEn ?? null),
    },
    // La ventana existe sólo si el catálogo mandó los minutos Y desde cuándo
    // cuentan. Con uno solo de los dos no hay reloj: habría que inventar el
    // otro, y un reloj clínico inventado es peor que ningún reloj.
    ventana:
      d.ventanaClinicaMin != null && d.ventanaInicioEn
        ? {
            minutos: d.ventanaClinicaMin,
            nombre: d.ventanaNombre ?? "Ventana clínica",
            inicioEn: d.ventanaInicioEn,
            version: d.protocoloVersion ?? null,
          }
        : null,
    paciente: {
      edad: p.edad ?? null,
      sexo: p.sexo ?? PACIENTE_VACIO.sexo,
      triage: nivelTriage(p.triage),
      dxCie10: p.dxCie10 ?? null,
      dxDescripcion: p.dxDescripcion ?? PACIENTE_VACIO.dxDescripcion,
      serviciosRequeridos: p.serviciosRequeridos ?? [],
      signosAlarma: p.signosAlarma ?? [],
      complejidadRequerida: p.complejidadRequerida ?? "media",
      requiereMedicoABordo: p.requiereMedicoABordo ?? false,
    },
    movil: d.movil ?? null,
    aceptadoEn: d.aceptadoEn ?? null,
    actualizadoEn: d.actualizadoEn ?? new Date(ahora).toISOString(),
  };
}

/** ETA en minutos + instante de la medida → hora de llegada en ISO. */
export function proyectarLlegada(
  etaMin: number | null,
  medidoEn: string | null,
): string | null {
  if (etaMin == null || !medidoEn) return null;
  const base = new Date(medidoEn).getTime();
  if (Number.isNaN(base)) return null;
  return new Date(base + etaMin * 60_000).toISOString();
}

// ─────────────────────────────────────────────────────────────────
// El camino degradado: reconstruir el prearribo desde GET /estado
// ─────────────────────────────────────────────────────────────────

/**
 * Arma el paquete con lo único que hay hoy: el caso público y su handshake.
 *
 * Lo que sale de aquí NO tiene protocolo, ni ventana clínica, ni checklist —
 * los tres los produce el servidor al aceptar (4.1) y todavía no existen. El
 * SBAR se compone de los campos estructurados y el ETA es el del despacho.
 * Cada uno de esos huecos se pinta como hueco declarado, no se rellena.
 */
export function paqueteDesdeEstado(
  casoId: string,
  estado: Pick<EstadoResponse, "casos" | "handshakes" | "congestion" | "ts">,
  nombrarServicios?: (cods: CodServicio[]) => string,
): PaqueteRecepcion | null {
  const caso = estado.casos.find((c) => c.id === casoId);
  if (!caso) return null;

  // Sólo la aceptación abre una recepción. Un handshake enviado o rechazado no
  // le da a nadie una cama que preparar.
  const aceptado =
    estado.handshakes.find(
      (h) => h.casoId === casoId && h.estado === "aceptado",
    ) ?? null;

  const sedeCodigo = aceptado?.sedeCodigo ?? null;
  const sedeNombre = sedeCodigo
    ? (estado.congestion.find((c) => c.codigo === sedeCodigo)?.nombre ?? null)
    : null;

  // El ETA del despacho se midió AL DESPACHAR, así que la llegada se proyecta
  // desde `enviadoEn` y no desde ahora. Proyectarla desde ahora regalaría
  // minutos que ya se gastaron y la cuenta de la cabecera mentiría.
  const etaMin = aceptado?.etaMinAlDespachar ?? null;
  const medidoEn = etaMin != null ? (aceptado?.enviadoEn ?? null) : null;

  return {
    fuente: "estado",
    casoId,
    sedeCodigo,
    sedeNombre,
    protocolo: null,
    sbar: componerSbar(caso, nombrarServicios),
    checklist: [],
    eta: {
      minutos: etaMin,
      procedencia: etaMin != null ? "despacho" : "sin-dato",
      medidoEn,
      llegadaEstimada: proyectarLlegada(etaMin, medidoEn),
    },
    ventana: null,
    paciente: {
      edad: caso.edad,
      sexo: caso.sexo,
      triage: caso.triage,
      dxCie10: caso.dxCie10,
      dxDescripcion: caso.dxDescripcion,
      serviciosRequeridos: caso.serviciosRequeridos,
      signosAlarma: caso.signosAlarma,
      complejidadRequerida: caso.complejidadRequerida,
      requiereMedicoABordo: caso.requiereMedicoABordo,
    },
    movil: caso.unidad ? { id: caso.unidad.id, tipo: caso.tipoMovil } : null,
    aceptadoEn: aceptado?.respondidoEn ?? null,
    actualizadoEn: estado.ts,
  };
}

const SEXO_TEXTO: Record<Sexo, string> = {
  M: "Masculino",
  F: "Femenino",
  desconocido: "Sexo no referido",
};

/** "Sin antecedentes" NO es un antecedente negativo: es que nadie los dictó. */
export const SIN_ANTECEDENTE =
  "No hay antecedentes en la extracción. Confirmar con la tripulación al arribo.";

/**
 * El SBAR de respaldo, compuesto con lo que el caso ya trae.
 *
 * Cuatro líneas, no cuatro párrafos: esto se lee a dos metros. Cada línea sale
 * de campos estructurados —resumen, signos de alarma, diagnóstico, servicios
 * requeridos— y ninguna agrega una palabra clínica que el caso no tenga. El
 * antecedente es el único que casi siempre falta, y se dice que falta en vez
 * de escribir "sin antecedentes de importancia", que es una afirmación médica
 * que nadie hizo.
 *
 * `nombrarServicios` se inyecta porque la tabla REPS vive en `presentacion.ts`
 * y este archivo no puede importar módulos locales (lo carga `node --test`).
 */
export function componerSbar(
  caso: Pick<
    CasoPublico,
    | "resumen"
    | "edad"
    | "sexo"
    | "triage"
    | "dxCie10"
    | "dxDescripcion"
    | "serviciosRequeridos"
    | "signosAlarma"
    | "complejidadRequerida"
    | "requiereMedicoABordo"
    | "tipoMovil"
  >,
  nombrarServicios: (cods: CodServicio[]) => string = (c) => c.join(" + "),
): SbarConProcedencia {
  const edad = caso.edad != null ? `${caso.edad} a` : "edad no referida";

  const evaluacion = [
    caso.dxCie10
      ? `${caso.dxDescripcion} (${caso.dxCie10})`
      : caso.dxDescripcion,
    ...caso.signosAlarma,
  ].join(" · ");

  const recomendacion = [
    caso.serviciosRequeridos.length
      ? nombrarServicios(caso.serviciosRequeridos)
      : "Urgencias",
    `complejidad ${caso.complejidadRequerida}`,
    caso.requiereMedicoABordo ? "médico a bordo" : `móvil ${caso.tipoMovil}`,
  ].join(" · ");

  return {
    motor: "campos-del-caso",
    lineas: {
      situacion: `${SEXO_TEXTO[caso.sexo]} ${edad} · ${caso.resumen}`,
      antecedente: SIN_ANTECEDENTE,
      evaluacion: `Triage ${caso.triage} · ${evaluacion}`,
      recomendacion,
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// Reloj 1 — el ETA y su procedencia
// ─────────────────────────────────────────────────────────────────

export interface RotuloEta {
  /** Lo que va debajo del número, en grande. */
  titulo: string;
  /** La frase que impide confundir un ETA del despacho con uno en vivo. */
  detalle: string;
  /** true sólo si sigue al móvil AHORA y con tráfico real. */
  enVivo: boolean;
  /** true si el número es una aproximación. La UI lo marca en ámbar. */
  aproximado: boolean;
}

/**
 * Rotula el ETA con la misma honestidad que la barra de `/campo`.
 *
 * Son DOS degradaciones distintas y se cruzan:
 *
 *   procedencia  ¿el número sigue al móvil (3.7) o es el del despacho?
 *   ruteo        ¿lo calculó Mapbox con tráfico o es distancia / 22 km/h?
 *
 * Un ETA "en vivo" calculado sin tráfico sigue siendo aproximado, y decir sólo
 * "en vivo" lo vendería mejor de lo que es.
 */
export function rotularEta(
  eta: Eta,
  ruteo?: "trafico" | "estimado",
): RotuloEta {
  const sinTrafico = ruteo === "estimado";

  if (eta.minutos == null || eta.procedencia === "sin-dato") {
    return {
      titulo: "Sin ETA",
      detalle:
        "No hay posición del móvil ni ETA del despacho. Confirme por radio.",
      enVivo: false,
      aproximado: true,
    };
  }

  if (eta.procedencia === "vivo") {
    return {
      titulo: sinTrafico ? "ETA en vivo, sin tráfico" : "ETA en vivo",
      detalle: sinTrafico
        ? "Sigue al móvil, pero el tiempo es por distancia: core no tiene Mapbox."
        : "Sigue la posición del móvil con tráfico real.",
      enVivo: true,
      aproximado: sinTrafico,
    };
  }

  return {
    titulo: "ETA del despacho, no en vivo",
    detalle: sinTrafico
      ? "Calculado al despachar, por distancia. No sigue al móvil."
      : "Calculado al despachar. No sigue al móvil: puede haberse retrasado.",
    enVivo: false,
    aproximado: true,
  };
}

export interface CuentaLlegada {
  /** Segundos que faltan. Negativo = la hora estimada ya pasó. null = sin dato. */
  restanteS: number | null;
  /** "07:12". Sin dato, "--:--". */
  reloj: string;
  /** Ya debió llegar. No es un error: es información que hay que mirar. */
  vencida: boolean;
  /** 1 recién despachada, 0 en la puerta. null si no se puede saber. */
  fraccion: number | null;
}

export function cuentaLlegada(eta: Eta, ahora = Date.now()): CuentaLlegada {
  if (!eta.llegadaEstimada) {
    return { restanteS: null, reloj: "--:--", vencida: false, fraccion: null };
  }

  const fin = new Date(eta.llegadaEstimada).getTime();
  if (Number.isNaN(fin)) {
    return { restanteS: null, reloj: "--:--", vencida: false, fraccion: null };
  }

  const restanteS = Math.round((fin - ahora) / 1000);
  const totalS = eta.minutos != null ? eta.minutos * 60 : null;

  return {
    restanteS,
    reloj: formatoMmSs(Math.max(0, restanteS)),
    vencida: restanteS <= 0,
    fraccion:
      totalS && totalS > 0
        ? Math.min(1, Math.max(0, restanteS / totalS))
        : null,
  };
}

/** mm:ss con dos dígitos. Para una pantalla de pared, no para un log. */
export function formatoMmSs(segundos: number): string {
  const abs = Math.abs(Math.trunc(segundos));
  const mm = Math.floor(abs / 60);
  const ss = abs % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────
// Reloj 2 — la ventana clínica
// ─────────────────────────────────────────────────────────────────

export interface EstadoVentana {
  totalMin: number;
  transcurridoMin: number;
  /** Puede ser negativo: la ventana ya se pasó y eso hay que verlo. */
  restanteMin: number;
  /** 0..1 de ventana CONSUMIDA. Es lo que llena el anillo. */
  consumida: number;
  vencida: boolean;
  /** Queda un cuarto o menos. Sube el contraste, no cambia el dato. */
  critica: boolean;
}

/** A partir de aquí la ventana se pinta en crítico. Un cuarto de la ventana. */
export const FRACCION_VENTANA_CRITICA = 0.75;

export function estadoVentana(
  ventana: VentanaClinica | null,
  ahora = Date.now(),
): EstadoVentana | null {
  if (!ventana) return null;

  const inicio = new Date(ventana.inicioEn).getTime();
  if (Number.isNaN(inicio) || ventana.minutos <= 0) return null;

  const transcurridoMin = (ahora - inicio) / 60_000;
  const restanteMin = ventana.minutos - transcurridoMin;
  const consumida = Math.min(1, Math.max(0, transcurridoMin / ventana.minutos));

  return {
    totalMin: ventana.minutos,
    transcurridoMin: Math.round(transcurridoMin),
    restanteMin: Math.round(restanteMin),
    consumida,
    vencida: restanteMin <= 0,
    critica: consumida >= FRACCION_VENTANA_CRITICA,
  };
}

// ─────────────────────────────────────────────────────────────────
// Reloj 3 — la preparación
// ─────────────────────────────────────────────────────────────────

/**
 * Tarea 4.11: a T-5 min con el checklist sin confirmar se avisa al jefe de
 * urgencias y se registra. No se le quita el caso a nadie — se deja constancia.
 */
export const AVISO_PREPARACION_MIN = 5;

export interface ProgresoPreparacion {
  total: number;
  confirmados: number;
  /** 0..1. Sin ítems es 0, no 1: nada confirmado no es "todo listo". */
  fraccion: number;
  completo: boolean;
  pendientes: ItemChecklist[];
  /** Falta preparación y la ambulancia está a T-5 min o menos. */
  urgente: boolean;
}

export function progresoPreparacion(
  items: ItemChecklist[],
  restanteS: number | null = null,
): ProgresoPreparacion {
  const pendientes = items.filter((i) => !i.confirmado);
  const confirmados = items.length - pendientes.length;

  // Sin checklist NO hay preparación completa. Un 100% sobre cero ítems diría
  // "todo listo" en la pantalla de un hospital que no ha preparado nada.
  const completo = items.length > 0 && pendientes.length === 0;

  return {
    total: items.length,
    confirmados,
    fraccion: items.length === 0 ? 0 : confirmados / items.length,
    completo,
    pendientes,
    urgente:
      !completo &&
      items.length > 0 &&
      restanteS !== null &&
      restanteS <= AVISO_PREPARACION_MIN * 60,
  };
}

// ─────────────────────────────────────────────────────────────────
// Utilidades de tiempo para la UI
// ─────────────────────────────────────────────────────────────────

/**
 * "hace 3 min". Sin esto, un checklist confirmado hace dos horas se ve igual
 * que uno confirmado hace treinta segundos, y no es lo mismo.
 *
 * Un instante en el futuro (reloj del servidor adelantado) se lee "recién": es
 * el error honesto, frente a "hace -2 min", que parece un bug.
 */
export function hace(iso: string | null, ahora = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";

  const segundos = Math.round((ahora - t) / 1000);
  if (segundos < 45) return "recién";

  const min = Math.round(segundos / 60);
  if (min < 60) return `hace ${min} min`;

  const horas = Math.floor(min / 60);
  const resto = min % 60;
  return resto === 0 ? `hace ${horas} h` : `hace ${horas} h ${resto} min`;
}

// ─────────────────────────────────────────────────────────────────
// Lo que la pantalla tiene que confesar
// ─────────────────────────────────────────────────────────────────

/**
 * Un hueco declarado: qué falta, de qué tarea viene y a qué cae mientras tanto.
 *
 * La regla 2 del repo dice que todo degrada **y lo dice**. En una pantalla de
 * pared eso no puede ser una nota al pie: si el hospital cree que el reloj
 * sigue al móvil y no lo hace, prepara la sala tarde.
 */
export interface HuecoDeclarado {
  id: string;
  titulo: string;
  detalle: string;
  /** 'critico' cambia lo que la pantalla afirma; 'aviso' sólo la empeora. */
  nivel: "critico" | "aviso";
}

export function huecosDe(
  paquete: PaqueteRecepcion,
  opciones: { canalEnVivo: boolean; ruteo?: "trafico" | "estimado" },
): HuecoDeclarado[] {
  const huecos: HuecoDeclarado[] = [];

  if (paquete.fuente === "estado") {
    huecos.push({
      id: "sin-recepcion",
      nivel: "critico",
      titulo: "Reconstruido desde el caso, no es el paquete de prearribo",
      detalle:
        "core todavía no expone GET /hospital/recepcion/:casoId (tarea 4.1). " +
        "Esto se armó con el caso público y su handshake: sin protocolo " +
        "confirmado, sin checklist y sin ventana clínica.",
    });
  }

  if (paquete.sbar?.motor === "campos-del-caso") {
    huecos.push({
      id: "sbar-sin-ia",
      nivel: "aviso",
      titulo: "SBAR compuesto de los campos del caso",
      detalle:
        "No lo redactó el generador de SBAR (tarea 4.2). Mismos datos, peor " +
        "redacción, y el antecedente no está porque nadie lo dictó.",
    });
  }

  if (!paquete.protocolo) {
    huecos.push({
      id: "sin-protocolo",
      nivel: "critico",
      titulo: "Sin protocolo confirmado",
      detalle:
        "El protocolo lo resuelve el catálogo versionado del servidor (4.1). " +
        "PULSO no lo deduce en la pantalla: activar un código infarto por " +
        "error enciende una sala de hemodinamia para nada.",
    });
  }

  if (!paquete.ventana) {
    huecos.push({
      id: "sin-ventana",
      nivel: "critico",
      titulo: "Sin ventana clínica",
      detalle:
        "Los umbrales (door-to-balloon 90 min, door-to-needle 60 min) viven en " +
        "el catálogo versionado de la tarea 4.4. Mientras no llegue, esta " +
        "pantalla no inventa un reloj clínico.",
    });
  }

  if (paquete.eta.procedencia !== "vivo") {
    huecos.push({
      id: "eta-no-vivo",
      nivel: "aviso",
      titulo: "ETA del despacho, no del móvil",
      detalle:
        "La posición en vivo del móvil llega con la tarea 3.7. El número de " +
        "arriba es el que se calculó al despachar.",
    });
  }

  if (opciones.ruteo === "estimado") {
    huecos.push({
      id: "ruteo-estimado",
      nivel: "aviso",
      titulo: "Tiempos por distancia, sin tráfico",
      detalle: "core no tiene Mapbox: los minutos son distancia / 22 km/h.",
    });
  }

  if (!opciones.canalEnVivo) {
    huecos.push({
      id: "sin-canal",
      nivel: "aviso",
      titulo: "Actualiza por sondeo, no por canal en vivo",
      detalle:
        "El canal caso:{id} llega con la tarea 3.9. Mientras tanto la pantalla " +
        "vuelve a preguntar cada 3 segundos.",
    });
  }

  return huecos;
}
