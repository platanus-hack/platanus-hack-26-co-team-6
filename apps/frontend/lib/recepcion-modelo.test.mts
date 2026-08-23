/**
 * Tests del modelo de prearribo.
 *
 * `node --test` con type stripping, igual que `sesion-modelo.test.mts`: el
 * frontend no tiene runner y montar uno para dos archivos costaría más que el
 * problema.
 *
 *   node --test lib/recepcion-modelo.test.mts
 *
 * Prueban COMPORTAMIENTO: qué afirma la pantalla y qué se niega a afirmar. Lo
 * que más se prueba aquí no es que los números salgan, es que un dato ausente
 * no se rellene — un ETA del despacho pintado como si siguiera al móvil hace
 * que un hospital prepare la sala tarde.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { CasoPublico, EstadoResponse } from "./types.ts";
import {
  AVISO_PREPARACION_MIN,
  componerSbar,
  cuentaLlegada,
  estadoVentana,
  etiquetaProtocolo,
  formatoMmSs,
  hace,
  huecosDe,
  normalizarPaquete,
  paqueteDesdeEstado,
  progresoPreparacion,
  proyectarLlegada,
  rotularEta,
  type Eta,
  type ItemChecklist,
} from "./recepcion-modelo.ts";

// ── Datos de prueba ──────────────────────────────────────────────

const AHORA = Date.parse("2026-03-01T10:00:00.000Z");
const HACE_8_MIN = new Date(AHORA - 8 * 60_000).toISOString();

const CASO: CasoPublico = {
  id: "caso_1",
  resumen: "Dolor precordial de 40 minutos, irradiado a brazo izquierdo",
  triage: 1,
  dxCie10: "I21.1",
  dxDescripcion: "Infarto agudo de miocardio de pared inferior",
  serviciosRequeridos: [743, 110],
  complejidadRequerida: "alta",
  edad: 54,
  sexo: "M",
  signosAlarma: ["Supradesnivel ST en cara inferior", "TA 170/95"],
  requiereMedicoABordo: true,
  confianza: 0.88,
  tipoMovil: "TAM",
  unidad: { id: "AMB-014" },
  creadoEn: HACE_8_MIN,
};

/** Nombres REPS, inyectados: la tabla real vive en `presentacion.ts`. */
const NOMBRAR = (cods: number[]) =>
  cods.map((c) => (c === 743 ? "Hemodinamia" : `Servicio ${c}`)).join(" + ");

function estadoCon(
  handshakes: EstadoResponse["handshakes"],
): Pick<EstadoResponse, "casos" | "handshakes" | "congestion" | "ts"> {
  return {
    casos: [CASO],
    handshakes,
    congestion: [
      {
        codigo: "110010123401",
        nombre: "Hospital San Carlos",
        indice: 0.3,
        etiqueta: "baja",
        aceptados: 4,
        rechazados: 1,
      },
    ],
    ts: new Date(AHORA).toISOString(),
  };
}

const ACEPTADO: EstadoResponse["handshakes"][number] = {
  id: "hs_1",
  casoId: "caso_1",
  sedeCodigo: "110010123401",
  canal: "consola",
  estado: "aceptado",
  motivoRechazo: null,
  enviadoEn: HACE_8_MIN,
  expiraEn: new Date(AHORA - 8 * 60_000 + 45_000).toISOString(),
  respondidoEn: new Date(AHORA - 8 * 60_000 + 12_000).toISOString(),
  latenciaS: 12,
  etaMinAlDespachar: 15,
};

// ── SBAR ─────────────────────────────────────────────────────────

describe("componerSbar", () => {
  it("arma cuatro líneas con lo que el caso ya trae", () => {
    const { lineas, motor } = componerSbar(CASO, NOMBRAR);

    assert.equal(motor, "campos-del-caso");
    assert.match(lineas.situacion, /Masculino 54 a/);
    assert.match(lineas.situacion, /Dolor precordial/);
    assert.match(lineas.evaluacion, /I21\.1/);
    assert.match(lineas.evaluacion, /Supradesnivel ST/);
    assert.match(lineas.recomendacion, /Hemodinamia/);
  });

  it("no inventa un antecedente que nadie dictó", () => {
    const { lineas } = componerSbar(CASO, NOMBRAR);

    // "Sin antecedentes de importancia" sería una afirmación médica que nadie
    // hizo. Lo correcto es decir que el dato falta.
    assert.doesNotMatch(lineas.antecedente, /sin antecedentes de/i);
    assert.match(lineas.antecedente, /No hay antecedentes/);
  });

  it("nunca deja salir el dictado crudo, aunque venga pegado al objeto", () => {
    // El tipo lo prohíbe, pero un `CasoPublico` que en runtime llegue con el
    // dictado adentro no puede filtrarlo a una pantalla de pared.
    const conDictado = {
      ...CASO,
      textoCrudo: "eh, aquí unidad 14, tengo un señor de 54...",
    } as CasoPublico;

    const { lineas } = componerSbar(conDictado, NOMBRAR);
    for (const linea of Object.values(lineas)) {
      assert.doesNotMatch(linea, /unidad 14/);
    }
  });

  it("dice que la edad no se refirió en vez de escribir 0 años", () => {
    const { lineas } = componerSbar({ ...CASO, edad: null }, NOMBRAR);
    assert.match(lineas.situacion, /edad no referida/);
  });
});

// ── Reconstrucción desde GET /estado ─────────────────────────────

describe("paqueteDesdeEstado", () => {
  it("usa el ETA del despacho y lo marca como tal", () => {
    const p = paqueteDesdeEstado("caso_1", estadoCon([ACEPTADO]), NOMBRAR)!;

    assert.equal(p.fuente, "estado");
    assert.equal(p.eta.procedencia, "despacho");
    assert.equal(p.eta.minutos, 15);
    // 15 min desde el DESPACHO (hace 8), no desde ahora: quedan 7.
    assert.equal(
      p.eta.llegadaEstimada,
      new Date(Date.parse(HACE_8_MIN) + 15 * 60_000).toISOString(),
    );
  });

  it("no inventa protocolo, ventana ni checklist", () => {
    const p = paqueteDesdeEstado("caso_1", estadoCon([ACEPTADO]), NOMBRAR)!;

    assert.equal(p.protocolo, null);
    assert.equal(p.ventana, null);
    assert.deepEqual(p.checklist, []);
  });

  it("la sede que prepara es la que aceptó, no la que rechazó", () => {
    const rechazo = {
      ...ACEPTADO,
      id: "hs_0",
      sedeCodigo: "110010999999",
      estado: "rechazado" as const,
    };
    const p = paqueteDesdeEstado(
      "caso_1",
      estadoCon([rechazo, ACEPTADO]),
      NOMBRAR,
    )!;

    assert.equal(p.sedeCodigo, "110010123401");
    assert.equal(p.sedeNombre, "Hospital San Carlos");
  });

  it("sin aceptación todavía no hay sede que prepare", () => {
    const p = paqueteDesdeEstado(
      "caso_1",
      estadoCon([{ ...ACEPTADO, estado: "enviado", respondidoEn: null }]),
      NOMBRAR,
    )!;

    assert.equal(p.sedeCodigo, null);
    assert.equal(p.eta.procedencia, "sin-dato");
  });

  it("devuelve null si el caso no está en el estado", () => {
    assert.equal(paqueteDesdeEstado("caso_9", estadoCon([]), NOMBRAR), null);
  });
});

// ── Lectura del paquete de core (4.1) ────────────────────────────

describe("normalizarPaquete", () => {
  const CRUDO = {
    casoId: "caso_1",
    sedeCodigo: "110010123401",
    sedeNombre: "Hospital San Carlos",
    protocolo: "codigo_infarto",
    protocoloVersion: "2026.1",
    sbar: {
      situacion: "Masculino 54a, dolor precordial 40 min",
      antecedente: "Fibrilación auricular",
      evaluacion: "Supradesnivel ST inferior · TA 170/95",
      recomendacion: "Hemodinamia + UCI adultos",
    },
    checklist: [
      { id: "sala_hemodinamia", etiqueta: "Sala de hemodinamia", confirmado: true },
      { id: "hemodinamista", etiqueta: "Hemodinamista de turno" },
    ],
    etaMin: 7,
    etaProcedencia: "vivo",
    etaMedidoEn: new Date(AHORA).toISOString(),
    ventanaClinicaMin: 90,
    ventanaNombre: "Door-to-balloon",
    ventanaInicioEn: HACE_8_MIN,
    paciente: { edad: 54, sexo: "M", triage: 1, dxDescripcion: "IAM inferior" },
  };

  it("lee el paquete completo", () => {
    const p = normalizarPaquete(CRUDO, AHORA)!;

    assert.equal(p.fuente, "recepcion");
    assert.equal(p.protocolo?.codigo, "codigo_infarto");
    assert.equal(p.protocolo?.version, "2026.1");
    assert.equal(p.sbar?.motor, "llm");
    assert.equal(p.checklist.length, 2);
    assert.equal(p.checklist[1].confirmado, false);
    assert.equal(p.eta.procedencia, "vivo");
    assert.equal(p.ventana?.minutos, 90);
  });

  it("proyecta la llegada cuando core manda ETA pero no la hora", () => {
    const p = normalizarPaquete(CRUDO, AHORA)!;
    assert.equal(
      p.eta.llegadaEstimada,
      new Date(AHORA + 7 * 60_000).toISOString(),
    );
  });

  it("un ETA sin procedencia declarada NO se asume en vivo", () => {
    const p = normalizarPaquete(
      { ...CRUDO, etaProcedencia: undefined },
      AHORA,
    )!;
    assert.equal(p.eta.procedencia, "despacho");
  });

  it("sin el instante de inicio no hay ventana clínica", () => {
    // Con los minutos pero sin desde cuándo, el reloj habría que inventarlo.
    const p = normalizarPaquete(
      { ...CRUDO, ventanaInicioEn: undefined },
      AHORA,
    )!;
    assert.equal(p.ventana, null);
  });

  it("un cuerpo que no se entiende es null, no un paquete a medias", () => {
    assert.equal(normalizarPaquete({ hola: "mundo" }, AHORA), null);
    assert.equal(normalizarPaquete(null, AHORA), null);
  });
});

// ── Reloj 1 · ETA ────────────────────────────────────────────────

describe("rotularEta", () => {
  const vivo: Eta = {
    minutos: 7,
    procedencia: "vivo",
    medidoEn: new Date(AHORA).toISOString(),
    llegadaEstimada: new Date(AHORA + 7 * 60_000).toISOString(),
  };

  it("en vivo con tráfico real es el único que se declara en vivo y exacto", () => {
    const r = rotularEta(vivo, "trafico");
    assert.equal(r.enVivo, true);
    assert.equal(r.aproximado, false);
  });

  it("en vivo sin Mapbox sigue siendo aproximado y lo dice", () => {
    const r = rotularEta(vivo, "estimado");
    assert.equal(r.enVivo, true);
    assert.equal(r.aproximado, true);
    assert.match(r.titulo, /sin tráfico/);
  });

  it("el del despacho dice que no es en vivo", () => {
    const r = rotularEta({ ...vivo, procedencia: "despacho" }, "trafico");
    assert.equal(r.enVivo, false);
    assert.equal(r.aproximado, true);
    assert.match(r.titulo, /no en vivo/);
    assert.match(r.detalle, /No sigue al móvil/);
  });

  it("sin ETA manda a confirmar por radio en vez de mostrar un cero", () => {
    const r = rotularEta({
      minutos: null,
      procedencia: "sin-dato",
      medidoEn: null,
      llegadaEstimada: null,
    });
    assert.equal(r.titulo, "Sin ETA");
    assert.match(r.detalle, /radio/);
  });
});

describe("cuentaLlegada", () => {
  it("cuenta contra la hora estimada, no contra los minutos originales", () => {
    const eta: Eta = {
      minutos: 15,
      procedencia: "despacho",
      medidoEn: HACE_8_MIN,
      llegadaEstimada: proyectarLlegada(15, HACE_8_MIN),
    };

    const c = cuentaLlegada(eta, AHORA);
    assert.equal(c.restanteS, 7 * 60);
    assert.equal(c.reloj, "07:00");
    assert.equal(c.vencida, false);
  });

  it("pasada la hora estimada lo dice en vez de contar hacia atrás", () => {
    const eta: Eta = {
      minutos: 5,
      procedencia: "despacho",
      medidoEn: HACE_8_MIN,
      llegadaEstimada: proyectarLlegada(5, HACE_8_MIN),
    };

    const c = cuentaLlegada(eta, AHORA);
    assert.equal(c.vencida, true);
    assert.equal(c.reloj, "00:00");
  });

  it("sin hora estimada no dibuja un reloj falso", () => {
    const c = cuentaLlegada(
      { minutos: null, procedencia: "sin-dato", medidoEn: null, llegadaEstimada: null },
      AHORA,
    );
    assert.equal(c.restanteS, null);
    assert.equal(c.reloj, "--:--");
  });
});

describe("formatoMmSs", () => {
  it("siempre dos dígitos", () => {
    assert.equal(formatoMmSs(432), "07:12");
    assert.equal(formatoMmSs(0), "00:00");
    assert.equal(formatoMmSs(5400), "90:00");
  });
});

// ── Reloj 2 · ventana clínica ────────────────────────────────────

describe("estadoVentana", () => {
  it("una ventana de 90 min abierta hace 8 deja 82", () => {
    const v = estadoVentana(
      {
        minutos: 90,
        nombre: "Door-to-balloon",
        inicioEn: HACE_8_MIN,
        version: "2026.1",
      },
      AHORA,
    )!;

    assert.equal(v.restanteMin, 82);
    assert.equal(v.vencida, false);
    assert.equal(v.critica, false);
  });

  it("con un cuarto o menos de ventana pasa a crítica", () => {
    const v = estadoVentana(
      {
        minutos: 60,
        nombre: "Door-to-needle",
        inicioEn: new Date(AHORA - 50 * 60_000).toISOString(),
        version: null,
      },
      AHORA,
    )!;

    assert.equal(v.restanteMin, 10);
    assert.equal(v.critica, true);
    assert.equal(v.vencida, false);
  });

  it("vencida se ve vencida, no se congela en cero", () => {
    const v = estadoVentana(
      {
        minutos: 60,
        nombre: "Door-to-needle",
        inicioEn: new Date(AHORA - 75 * 60_000).toISOString(),
        version: null,
      },
      AHORA,
    )!;

    assert.equal(v.vencida, true);
    assert.equal(v.restanteMin, -15);
    assert.equal(v.consumida, 1);
  });

  it("sin catálogo de protocolos no hay ventana que pintar", () => {
    assert.equal(estadoVentana(null, AHORA), null);
  });
});

// ── Reloj 3 · preparación ────────────────────────────────────────

describe("progresoPreparacion", () => {
  const items: ItemChecklist[] = [
    {
      id: "sala",
      etiqueta: "Sala de hemodinamia",
      responsable: "Enfermera jefe",
      confirmado: true,
      confirmadoPor: "Enf. jefe M. Ruiz",
      confirmadoEn: new Date(AHORA - 3 * 60_000).toISOString(),
    },
    {
      id: "hemodinamista",
      etiqueta: "Hemodinamista de turno",
      responsable: null,
      confirmado: false,
      confirmadoPor: null,
      confirmadoEn: null,
    },
  ];

  it("cuenta lo confirmado y deja los pendientes a la vista", () => {
    const p = progresoPreparacion(items, 20 * 60);
    assert.equal(p.total, 2);
    assert.equal(p.confirmados, 1);
    assert.equal(p.completo, false);
    assert.deepEqual(
      p.pendientes.map((i) => i.id),
      ["hemodinamista"],
    );
  });

  it("un checklist vacío NO es preparación completa", () => {
    const p = progresoPreparacion([], 20 * 60);
    assert.equal(p.completo, false);
    assert.equal(p.fraccion, 0);
    assert.equal(p.urgente, false);
  });

  it(`se vuelve urgente a T-${AVISO_PREPARACION_MIN} min sin confirmar`, () => {
    assert.equal(progresoPreparacion(items, AVISO_PREPARACION_MIN * 60).urgente, true);
    assert.equal(progresoPreparacion(items, AVISO_PREPARACION_MIN * 60 + 1).urgente, false);
  });

  it("todo confirmado no es urgente aunque esté en la puerta", () => {
    const todos = items.map((i) => ({ ...i, confirmado: true }));
    const p = progresoPreparacion(todos, 30);
    assert.equal(p.completo, true);
    assert.equal(p.urgente, false);
  });
});

// ── Utilidades ───────────────────────────────────────────────────

describe("hace", () => {
  it("dice hace cuánto en la unidad que se lee de un vistazo", () => {
    assert.equal(hace(new Date(AHORA - 10_000).toISOString(), AHORA), "recién");
    assert.equal(hace(new Date(AHORA - 3 * 60_000).toISOString(), AHORA), "hace 3 min");
    assert.equal(hace(new Date(AHORA - 60 * 60_000).toISOString(), AHORA), "hace 1 h");
    assert.equal(
      hace(new Date(AHORA - 72 * 60_000).toISOString(), AHORA),
      "hace 1 h 12 min",
    );
  });

  it("un reloj adelantado no produce 'hace -2 min'", () => {
    assert.equal(hace(new Date(AHORA + 120_000).toISOString(), AHORA), "recién");
  });
});

describe("etiquetaProtocolo", () => {
  it("pone las tildes que el identificador no puede llevar", () => {
    assert.equal(etiquetaProtocolo("codigo_infarto"), "CÓDIGO INFARTO");
  });

  it("un protocolo que el front no conoce se muestra igual, no se descarta", () => {
    assert.equal(etiquetaProtocolo("codigo_sepsis"), "CODIGO SEPSIS");
  });
});

// ── Lo que la pantalla confiesa ──────────────────────────────────

describe("huecosDe", () => {
  it("el paquete reconstruido confiesa los tres huecos que cambian lo que afirma", () => {
    const p = paqueteDesdeEstado("caso_1", estadoCon([ACEPTADO]), NOMBRAR)!;
    const ids = huecosDe(p, { canalEnVivo: false, ruteo: "trafico" }).map((h) => h.id);

    assert.ok(ids.includes("sin-recepcion"));
    assert.ok(ids.includes("sin-protocolo"));
    assert.ok(ids.includes("sin-ventana"));
    assert.ok(ids.includes("eta-no-vivo"));
    assert.ok(ids.includes("sin-canal"));
  });

  it("un paquete completo y en vivo no inventa avisos", () => {
    const completo = normalizarPaquete(
      {
        casoId: "caso_1",
        protocolo: "codigo_infarto",
        sbar: {
          situacion: "s",
          antecedente: "b",
          evaluacion: "a",
          recomendacion: "r",
        },
        etaMin: 7,
        etaProcedencia: "vivo",
        etaMedidoEn: new Date(AHORA).toISOString(),
        ventanaClinicaMin: 90,
        ventanaInicioEn: HACE_8_MIN,
      },
      AHORA,
    )!;

    assert.deepEqual(
      huecosDe(completo, { canalEnVivo: true, ruteo: "trafico" }),
      [],
    );
  });
});
