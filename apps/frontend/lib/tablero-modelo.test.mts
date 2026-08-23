/**
 * Tests del tablero de /campo.
 *
 * Prueban lo que decide qué ve el paramédico: qué exige acción, en qué orden
 * y qué encuentra el buscador. Nada de esto puede fallar en silencio — una
 * lista mal ordenada aquí es un caso que nadie mira.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  agrupar,
  armarTablero,
  buscarSedes,
  coincide,
  etapaDe,
  exigeAccion,
  FILTRO_VACIO,
  hayFiltro,
  normalizar,
} from "./tablero-modelo.ts";

const AHORA = new Date("2026-08-23T03:00:00Z").getTime();

function caso(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    resumen: "Paciente con dolor precordial",
    triage: 2,
    dxCie10: "I21.9",
    dxDescripcion: "Síndrome coronario agudo",
    serviciosRequeridos: [743],
    complejidadRequerida: "alta",
    edad: 54,
    sexo: "M",
    signosAlarma: ["Inestabilidad hemodinámica"],
    requiereMedicoABordo: true,
    confianza: 0.9,
    tipoMovil: "TAM",
    unidad: { id: "AMB-01" },
    creadoEn: "2026-08-23T02:50:00Z",
    ...extra,
  } as never;
}

function hs(casoId: string, estado: string, extra: Record<string, unknown> = {}) {
  return {
    id: `h-${casoId}-${estado}`,
    casoId,
    sedeCodigo: "110010123401",
    canal: "consola",
    estado,
    motivoRechazo: null,
    enviadoEn: "2026-08-23T02:52:00Z",
    expiraEn: "2026-08-23T02:53:00Z",
    respondidoEn: null,
    latenciaS: null,
    ...extra,
  } as never;
}

describe("etapaDe", () => {
  it("sin handshake, nadie lo ha despachado", () => {
    assert.equal(etapaDe(null), "por-atender");
  });
  it("enviado es espera; aceptado cierra; lo demás rebotó", () => {
    assert.equal(etapaDe(hs("c", "enviado")), "esperando");
    assert.equal(etapaDe(hs("c", "aceptado")), "aceptado");
    assert.equal(etapaDe(hs("c", "rechazado")), "rebotado");
    assert.equal(etapaDe(hs("c", "timeout")), "rebotado");
  });
});

describe("exigeAccion", () => {
  it("solo lo que nadie ha resuelto", () => {
    assert.equal(exigeAccion("por-atender"), true);
    assert.equal(exigeAccion("rebotado"), true);
    assert.equal(exigeAccion("esperando"), false);
    assert.equal(exigeAccion("aceptado"), false);
  });
});

describe("armarTablero", () => {
  it("empareja cada caso con su handshake MÁS RECIENTE", () => {
    const t = armarTablero(
      [caso("c1")],
      [
        hs("c1", "rechazado", { enviadoEn: "2026-08-23T02:51:00Z" }),
        hs("c1", "aceptado", {
          enviadoEn: "2026-08-23T02:55:00Z",
          respondidoEn: "2026-08-23T02:56:00Z",
        }),
      ],
      AHORA,
    );
    assert.equal(t[0].etapa, "aceptado");
  });

  it("el tiempo hasta destino sale del servidor, no del reloj local", () => {
    const t = armarTablero(
      [caso("c1")],
      [hs("c1", "aceptado", { respondidoEn: "2026-08-23T02:53:00Z" })],
      AHORA,
    );
    // 02:50 → 02:53 = 180 s, sin importar qué hora sea "ahora".
    assert.equal(t[0].cierreS, 180);
  });

  it("sin respondidoEn no inventa un cierre", () => {
    const t = armarTablero([caso("c1")], [hs("c1", "enviado")], AHORA);
    assert.equal(t[0].cierreS, null);
  });

  it("un caso sin handshake queda por atender", () => {
    const t = armarTablero([caso("c1")], [], AHORA);
    assert.equal(t[0].etapa, "por-atender");
    assert.equal(t[0].transcurridoS, 600);
  });
});

describe("normalizar", () => {
  it("ignora tildes y mayúsculas: nadie las escribe conduciendo", () => {
    assert.equal(normalizar("Síndrome CORONARIO"), "sindrome coronario");
    assert.equal(normalizar("  Cardíaco "), "cardiaco");
  });
});

describe("coincide", () => {
  const item = armarTablero([caso("c1")], [], AHORA)[0];

  it("busca sin tildes en el diagnóstico", () => {
    assert.equal(coincide(item, { ...FILTRO_VACIO, texto: "sindrome" }), true);
  });
  it("busca por CIE-10 y por móvil", () => {
    assert.equal(coincide(item, { ...FILTRO_VACIO, texto: "I21" }), true);
    assert.equal(coincide(item, { ...FILTRO_VACIO, texto: "amb-01" }), true);
  });
  it("busca en los signos de alarma", () => {
    assert.equal(coincide(item, { ...FILTRO_VACIO, texto: "hemodinamica" }), true);
  });
  it("todas las palabras tienen que estar, en cualquier orden", () => {
    assert.equal(coincide(item, { ...FILTRO_VACIO, texto: "coronario agudo" }), true);
    assert.equal(coincide(item, { ...FILTRO_VACIO, texto: "agudo coronario" }), true);
    assert.equal(coincide(item, { ...FILTRO_VACIO, texto: "coronario fractura" }), false);
  });
  it("filtra por triage y por etapa", () => {
    assert.equal(coincide(item, { ...FILTRO_VACIO, triages: [2] }), true);
    assert.equal(coincide(item, { ...FILTRO_VACIO, triages: [1] }), false);
    assert.equal(coincide(item, { ...FILTRO_VACIO, etapas: ["por-atender"] }), true);
    assert.equal(coincide(item, { ...FILTRO_VACIO, etapas: ["aceptado"] }), false);
  });
  it("sin filtro pasa todo", () => {
    assert.equal(coincide(item, FILTRO_VACIO), true);
    assert.equal(hayFiltro(FILTRO_VACIO), false);
    assert.equal(hayFiltro({ ...FILTRO_VACIO, texto: "x" }), true);
  });
});

describe("agrupar", () => {
  const items = armarTablero(
    [
      caso("sin-despachar", { triage: 3 }),
      caso("urgente", { triage: 1, creadoEn: "2026-08-23T02:59:00Z" }),
      caso("esperando"),
      caso("cerrado"),
      caso("rebotado"),
    ],
    [
      hs("esperando", "enviado"),
      hs("cerrado", "aceptado", { respondidoEn: "2026-08-23T02:55:00Z" }),
      hs("rebotado", "rechazado"),
    ],
    AHORA,
  );

  it("separa en los tres grupos que importan", () => {
    const g = agrupar(items, FILTRO_VACIO);
    assert.deepEqual(
      g.porAtender.map((i) => i.caso.id),
      // triage 1, 2 y 3: manda la urgencia, no el orden en que llegaron.
      ["urgente", "rebotado", "sin-despachar"],
    );
    assert.deepEqual(g.enCurso.map((i) => i.caso.id), ["esperando"]);
    assert.deepEqual(g.cerrados.map((i) => i.caso.id), ["cerrado"]);
    assert.equal(g.total, 5);
  });

  it("en 'por atender' manda el triage, no la hora", () => {
    const g = agrupar(items, FILTRO_VACIO);
    // 'urgente' es triage 1 y el MÁS nuevo; aun así va primero.
    assert.equal(g.porAtender[0].caso.id, "urgente");
    assert.equal(g.porAtender[0].caso.triage, 1);
  });

  it("filtrar no cambia el total: se puede decir '1 de 5'", () => {
    const g = agrupar(items, { ...FILTRO_VACIO, triages: [1] });
    assert.equal(g.porAtender.length, 1);
    assert.equal(g.total, 5);
  });
});

describe("buscarSedes", () => {
  const sedes = [
    { codigo: "1", nombre: "Hospital San Carlos", indice: 0.4, etiqueta: "baja" as const, aceptados: 1, rechazados: 0 },
    { codigo: "2", nombre: "Clínica del Norte", indice: 0.9, etiqueta: "crítica" as const, aceptados: 0, rechazados: 5 },
    { codigo: "3", nombre: "Hospital Simón Bolívar", indice: 0.7, etiqueta: "alta" as const, aceptados: 2, rechazados: 1 },
  ];

  it("las más cargadas primero: es lo que cambia una decisión", () => {
    assert.deepEqual(
      buscarSedes(sedes, "").map((s) => s.etiqueta),
      ["crítica", "alta", "baja"],
    );
  });
  it("busca por nombre sin tildes", () => {
    assert.deepEqual(buscarSedes(sedes, "simon").map((s) => s.codigo), ["3"]);
  });
  it("y por código", () => {
    assert.deepEqual(buscarSedes(sedes, "2").map((s) => s.codigo), ["2"]);
  });
  it("respeta el límite", () => {
    assert.equal(buscarSedes(sedes, "", 2).length, 2);
  });
});
