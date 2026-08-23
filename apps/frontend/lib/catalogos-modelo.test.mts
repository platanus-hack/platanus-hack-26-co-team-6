/**
 * Tests del modelo de catálogos versionados.
 *
 * `node --test` con type stripping, igual que `sesion-modelo.test.mts`: el
 * frontend no tiene runner y montar uno para dos archivos costaría más que el
 * problema. Por eso `catalogos-modelo.ts` no importa React ni `api.ts`.
 *
 *   node --test lib/catalogos-modelo.test.mts
 *
 * Prueban comportamiento: qué ve y qué puede hacer un admin, no cómo está
 * escrito el comparador.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  codigoValido,
  comparableConHoy,
  compararVersiones,
  decidirServicios,
  describirDesfase,
  describirDiferencia,
  historialDe,
  identidad,
  leerVersiones,
  normalizarCodigo,
  normalizarDx,
  prefijosDe,
  previsualizar,
  problemaDeCodigo,
  resolverDx,
  siguienteVersion,
  vigente,
  type VersionEntrada,
} from "./catalogos-modelo.ts";

function fila(over: Partial<VersionEntrada> = {}): VersionEntrada {
  return {
    id: "fila-1",
    coleccion: "motivo_rechazo",
    codigo: "SIN_CAMA_UCI",
    version: 1,
    etiqueta: "Sin camas UCI disponibles",
    datos: { categoria: "capacidad", requiereDetalle: false },
    activo: true,
    motivo: null,
    creadoEn: "2026-01-01T00:00:00.000Z",
    creadoPor: "sistema",
    ...over,
  };
}

/** El mapa Dx tal como lo devuelve core con las semillas. */
const MAPA: VersionEntrada[] = [
  fila({
    coleccion: "mapa_dx",
    codigo: "I21",
    etiqueta: "Infarto agudo de miocardio",
    datos: {
      serviciosRequeridos: [743],
      complejidadMinima: "alta",
      requiereMedicoABordo: true,
      protocolo: "CODIGO_INFARTO",
    },
  }),
  fila({
    id: "fila-2",
    coleccion: "mapa_dx",
    codigo: "K35",
    etiqueta: "Apendicitis aguda",
    datos: {
      serviciosRequeridos: [203],
      complejidadMinima: "media",
      requiereMedicoABordo: false,
      protocolo: null,
    },
  }),
];

describe("el código es inmutable", () => {
  it("acepta la forma que exige el servidor y rechaza el resto", () => {
    assert.equal(codigoValido("SIN_CAMA_UCI"), true);
    assert.equal(codigoValido("I21"), true);
    assert.equal(codigoValido("sin_cama"), false);
    assert.equal(codigoValido("SIN CAMA"), false);
    assert.equal(codigoValido("CÓDIGO"), false);
  });

  it("normaliza sin arreglar lo que está mal", () => {
    assert.equal(normalizarCodigo("  i21 "), "I21");
    assert.equal(codigoValido(normalizarCodigo("sin cama")), false);
  });

  it("explica el problema en vez de dar un error genérico", () => {
    // El código no se puede corregir después: un mensaje vago aquí es un
    // error permanente en el dataset.
    assert.match(problemaDeCodigo("")!, /obligatorio/i);
    assert.match(problemaDeCodigo("sin cama")!, /espacios|tildes|mayúsculas/i);
    assert.equal(problemaDeCodigo("SIN_CAMA_UCI"), null);
    // Se normaliza antes de juzgar: teclear en minúsculas no es un error.
    assert.equal(problemaDeCodigo("i21"), null);
  });
});

describe("editar una etiqueta no rompe el histórico", () => {
  const v1 = fila();

  it("previsualizar dice que va a salir la versión 2, no un reemplazo", () => {
    const p = previsualizar(v1, {
      etiqueta: "Sin disponibilidad de camas de cuidado intensivo",
      datos: v1.datos,
      activo: true,
      motivo: "Vocabulario del comité clínico de agosto",
    });

    assert.equal(p.accion, "nueva-version");
    if (p.accion !== "nueva-version") return;
    assert.equal(p.version, 2);
    assert.deepEqual(p.cambios, [
      {
        campo: "etiqueta",
        antes: "Sin camas UCI disponibles",
        despues: "Sin disponibilidad de camas de cuidado intensivo",
      },
    ]);
  });

  it("la versión previa sigue intacta y sigue en el historial", () => {
    const v2 = fila({ id: "fila-2", version: 2, etiqueta: "Otra redacción" });
    const historial = historialDe([v2, v1], "SIN_CAMA_UCI");

    assert.deepEqual(historial.map((f) => f.version), [1, 2]);
    assert.equal(historial[0].etiqueta, "Sin camas UCI disponibles");
    // Y el código es el mismo en las dos: es lo que mantiene la serie unida.
    assert.equal(historial[0].codigo, historial[1].codigo);
    assert.equal(vigente(historial)?.version, 2);
    assert.equal(identidad(historial[1]), "SIN_CAMA_UCI@2");
  });

  it("sin cambios no se ofrece guardar", () => {
    const p = previsualizar(v1, {
      etiqueta: v1.etiqueta,
      datos: { ...v1.datos },
      activo: true,
      motivo: "da igual",
    });
    assert.equal(p.accion, "sin-cambios");
  });

  it("reordenar las claves de datos no cuenta como cambio", () => {
    // El navegador puede serializar en otro orden. Una versión fantasma
    // ensucia el histórico justo donde se va a buscar el cambio real.
    const p = previsualizar(v1, {
      etiqueta: v1.etiqueta,
      datos: { requiereDetalle: false, categoria: "capacidad" },
      activo: true,
      motivo: "da igual",
    });
    assert.equal(p.accion, "sin-cambios");
  });

  it("el motivo es obligatorio de la v2 en adelante", () => {
    const p = previsualizar(v1, {
      etiqueta: "Otra cosa",
      datos: v1.datos,
      activo: true,
      motivo: "   ",
    });
    assert.equal(p.accion, "falta-motivo");
  });

  it("retirar es un cambio de estado, no un borrado", () => {
    const p = previsualizar(v1, {
      etiqueta: v1.etiqueta,
      datos: v1.datos,
      activo: false,
      motivo: "Ya no se usa",
    });
    assert.equal(p.accion, "nueva-version");
    if (p.accion !== "nueva-version") return;
    assert.deepEqual(p.cambios, [{ campo: "activo", antes: true, despues: false }]);
    assert.equal(describirDiferencia(p.cambios[0]), "estado: retirada");
  });
});

describe("comparar dos versiones", () => {
  it("desglosa datos campo por campo, no como bloque", () => {
    const cambios = compararVersiones(
      { etiqueta: "IAM", activo: true, datos: { serviciosRequeridos: [743] } },
      { etiqueta: "IAM", activo: true, datos: { serviciosRequeridos: [743, 110] } },
    );
    assert.deepEqual(cambios, [
      { campo: "datos.serviciosRequeridos", antes: [743], despues: [743, 110] },
    ]);
    assert.equal(
      describirDiferencia(cambios[0]),
      "serviciosRequeridos: [743] → [743,110]",
    );
  });

  it("siguienteVersion arranca en 1 y sigue desde la vigente", () => {
    assert.equal(siguienteVersion([], "NUEVO"), 1);
    assert.equal(siguienteVersion([fila(), fila({ version: 2 })], "SIN_CAMA_UCI"), 3);
  });
});

describe("el mapa Dx → servicios", () => {
  it("el punto del CIE-10 es notación, no dato", () => {
    assert.equal(normalizarDx("I21.1"), "I211");
    assert.equal(normalizarDx("i21.1"), "I211");
    assert.equal(normalizarDx(null), "");
    assert.deepEqual(prefijosDe("I211"), ["I211", "I21"]);
  });

  it("la subcategoría cae en la categoría", () => {
    const r = resolverDx(MAPA, "I21.9");
    assert.equal(r.estado, "mapeado");
    if (r.estado !== "mapeado") return;
    assert.equal(r.codigo, "I21");
    assert.equal(r.exacto, false);
    assert.deepEqual(r.serviciosRequeridos, [743]);
    // 408 es radioterapia. El README original del proyecto decía otra cosa.
    assert.ok(!r.serviciosRequeridos.includes(408));
  });

  it("un diagnóstico sin mapeo escala a criterio humano y no se inventa", () => {
    const r = resolverDx(MAPA, "E10.1");
    assert.equal(r.estado, "sin-mapeo");
    if (r.estado !== "sin-mapeo") return;
    assert.equal(r.motivo, "sin-entrada-en-tabla");
    assert.equal(r.accion, "escala-a-criterio-humano");
    assert.match(r.mensaje, /criterio humano/i);
  });

  it("sin diagnóstico y con uno incompleto tampoco se adivina", () => {
    assert.equal((resolverDx(MAPA, null) as { motivo: string }).motivo, "sin-diagnostico");
    assert.equal(
      (resolverDx(MAPA, "I2") as { motivo: string }).motivo,
      "diagnostico-incompleto",
    );
  });

  it("una entrada retirada se distingue de una que nunca existió", () => {
    const retirada = fila({
      id: "k35-v2",
      coleccion: "mapa_dx",
      codigo: "K35",
      version: 2,
      activo: false,
      datos: MAPA[1].datos,
    });
    const r = resolverDx([...MAPA, retirada], "K35.0");
    assert.equal(r.estado, "sin-mapeo");
    if (r.estado !== "sin-mapeo") return;
    assert.equal(r.motivo, "entrada-retirada");
  });
});

describe("el LLM propone, la tabla decide", () => {
  it("lo propuesto de más no se exige, pero se reporta", () => {
    const d = decidirServicios(resolverDx(MAPA, "I21.1"), [743, 245]);
    assert.equal(d.estado, "tabla-decide");
    if (d.estado !== "tabla-decide") return;
    assert.deepEqual(d.serviciosRequeridos, [743]);
    assert.deepEqual(d.propuestosNoExigidos, [245]);
  });

  it("lo que la tabla exige y el modelo no vio, se exige igual", () => {
    const d = decidirServicios(resolverDx(MAPA, "K35.0"), []);
    assert.equal(d.estado, "tabla-decide");
    if (d.estado !== "tabla-decide") return;
    assert.deepEqual(d.exigidosNoPropuestos, [203]);
  });

  it("sin mapeo, lo que propuso el modelo NO se convierte en exigencia", () => {
    // El test que defiende la regla entera.
    const d = decidirServicios(resolverDx(MAPA, "E10.1"), [110]);
    assert.equal(d.estado, "escala-a-criterio-humano");
    if (d.estado !== "escala-a-criterio-humano") return;
    assert.deepEqual(d.propuestoPorLlm, [110]);
    assert.ok(!("serviciosRequeridos" in d));
  });
});

describe("con qué se procesó un caso", () => {
  const base = {
    registro: {
      id: "r1",
      casoId: "caso-viejo",
      coleccion: "prompt_clinico",
      codigo: "TRIAGE_EXTRACCION",
      version: 1,
      procesadoEn: "2026-08-15T03:12:00.000Z",
    },
    version: fila({ coleccion: "prompt_clinico", codigo: "TRIAGE_EXTRACCION" }),
  };

  it("avisa cuando el caso ya no es comparable con los de hoy", () => {
    const desfasado = { ...base, versionesPosteriores: 2 };
    assert.equal(comparableConHoy(desfasado), false);
    assert.match(describirDesfase(desfasado), /2 versiones/);
    assert.match(describirDesfase(desfasado), /no es directamente comparable/i);
  });

  it("y cuando sí lo es, lo dice también", () => {
    const alDia = { ...base, versionesPosteriores: 0 };
    assert.equal(comparableConHoy(alDia), true);
    assert.match(describirDesfase(alDia), /vigente/i);
  });
});

describe("lo que llega del servidor no se cree a ciegas", () => {
  it("un cuerpo que no se entiende se descarta en vez de romper la consola", () => {
    assert.deepEqual(leerVersiones(null), []);
    assert.deepEqual(leerVersiones([{ codigo: "X" }]), []);
  });

  it("campos de más de un core más nuevo se ignoran sin quejarse", () => {
    const leidas = leerVersiones([{ ...fila(), campoDelFuturo: true }]);
    assert.equal(leidas.length, 1);
    assert.equal(leidas[0].codigo, "SIN_CAMA_UCI");
  });
});
