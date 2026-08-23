/**
 * Tests del modelo de capacidad declarada.
 *
 * `node --test` con type stripping, igual que `sesion-modelo.test.mts`: el
 * frontend no tiene runner y montar uno para tres archivos costaría más que el
 * problema. Por eso `capacidad-modelo.ts` no importa React ni `api.ts`.
 *
 *   node --test lib/capacidad-modelo.test.mts
 *
 * Prueban comportamiento, no implementación: qué ve el jefe de urgencias
 * cuando toca algo y core no contesta, no cómo está escrito el reductor.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  ajustarDisponibles,
  CAPACIDAD_INICIAL,
  caducidad,
  claveCama,
  ESTADOS_OPERATIVOS,
  exigeMotivo,
  formatearDuracion,
  hace,
  MOTIVO_OTRO,
  motivosDe,
  nombreCama,
  normalizarDeclaracion,
  proyectar,
  puedeAjustar,
  reducirCapacidad,
  rotularProcedencia,
  rotuloCaducidad,
  type AccionCapacidad,
  type Declaracion,
  type EstadoCapacidad,
} from "./capacidad-modelo.ts";

/** Un instante fijo: los tests no dependen del reloj de quien los corre. */
const AHORA = Date.parse("2026-08-22T03:00:00.000Z");
const min = (n: number) => n * 60_000;
const h = (n: number) => n * 3_600_000;

/** Lo que devolverá `GET /capacidad/:sede` cuando 3.3 exista. */
const DECLARADA = {
  sedeCodigo: "110010123401",
  operativo: "contingencia",
  motivo: "Falla de servicios públicos",
  camas: [
    { tipo: "CAMAS-UCI Adultos", disponibles: 2, total: 14 },
    { tipo: "CAMAS-Adultos", disponibles: 11, total: 60 },
  ],
  venceEn: new Date(AHORA + h(3) + min(12)).toISOString(),
  declaradoEn: new Date(AHORA - min(12)).toISOString(),
  declaradoPor: { id: "act_1", nombre: "N. Robledo" },
  procedencia: "declarada",
};

/** Lo que devolverá cuando nadie haya declarado nada. */
const SNAPSHOT = {
  sedeCodigo: "110010123401",
  operativo: "recibiendo",
  camas: [{ tipo: "CAMAS-UCI Adultos", disponibles: 3, total: 14 }],
  venceEn: null,
  declaradoEn: "2022-11-30T00:00:00.000Z",
  declaradoPor: null,
  procedencia: "snapshot-reps",
};

function conBase(declaracion: Declaracion): EstadoCapacidad {
  return reducirCapacidad(CAPACIDAD_INICIAL, { tipo: "cargada", declaracion });
}

function aplicar(
  estado: EstadoCapacidad,
  ...acciones: AccionCapacidad[]
): EstadoCapacidad {
  return acciones.reduce(reducirCapacidad, estado);
}

// ─────────────────────────────────────────────────────────────────

describe("normalizarDeclaracion", () => {
  it("lee lo que core va a mandar", () => {
    const d = normalizarDeclaracion(DECLARADA);
    assert.ok(d);
    assert.equal(d.operativo, "contingencia");
    assert.equal(d.procedencia, "declarada");
    assert.equal(d.camas.length, 2);
    assert.equal(d.camas[0].total, 14);
  });

  it("un cuerpo sin procedencia se descarta entero", () => {
    const sinProcedencia: Record<string, unknown> = { ...DECLARADA };
    delete sinProcedencia.procedencia;
    assert.equal(normalizarDeclaracion(sinProcedencia), null);
  });

  it("basura no produce una declaración a medias", () => {
    for (const basura of [null, undefined, 7, "ok", {}, { operativo: "raro" }]) {
      assert.equal(normalizarDeclaracion(basura), null, JSON.stringify(basura));
    }
  });

  it("un estado operativo que este build no conoce no se acepta", () => {
    assert.equal(
      normalizarDeclaracion({ ...DECLARADA, operativo: "en_alerta_naranja" }),
      null,
    );
  });

  it("campos nuevos de un core más nuevo no rompen nada", () => {
    const d = normalizarDeclaracion({ ...DECLARADA, ventanaClinica: "x", v: 3 });
    assert.ok(d);
    assert.equal(d.operativo, "contingencia");
  });

  it("sin camas devuelve lista vacía, no undefined", () => {
    const sinCamas: Record<string, unknown> = { ...DECLARADA };
    delete sinCamas.camas;
    assert.deepEqual(normalizarDeclaracion(sinCamas)?.camas, []);
  });
});

describe("exigeMotivo", () => {
  it("todo lo que saca a la sede del ranking pide motivo", () => {
    assert.equal(exigeMotivo("recibiendo"), false);
    for (const e of ESTADOS_OPERATIVOS.filter((x) => x !== "recibiendo")) {
      assert.equal(exigeMotivo(e), true, e);
    }
  });

  it("volver a recibir es un solo toque: no pide nada", () => {
    assert.deepEqual(motivosDe("recibiendo"), []);
  });

  it("cada estado ofrece una lista corta con 'Otro' al final", () => {
    for (const e of ["saturado", "contingencia", "cerrado"] as const) {
      const lista = motivosDe(e);
      assert.ok(lista.length >= 2 && lista.length <= 6, `${e}: ${lista.length}`);
      assert.equal(lista[lista.length - 1], MOTIVO_OTRO);
    }
  });
});

describe("formatearDuracion", () => {
  it("da la frase que va en pantalla", () => {
    assert.equal(formatearDuracion(h(3) + min(12)), "3 h 12 min");
    assert.equal(formatearDuracion(min(12)), "12 min");
    assert.equal(formatearDuracion(h(4)), "4 h");
    assert.equal(formatearDuracion(30_000), "menos de 1 min");
    assert.equal(formatearDuracion(0), "menos de 1 min");
  });

  it("no imprime números negativos", () => {
    assert.equal(formatearDuracion(-min(5)), "menos de 1 min");
  });

  it("a partir de un día cambia de unidad en vez de decir '96 h'", () => {
    assert.equal(formatearDuracion(h(26)), "1 d 2 h");
    assert.equal(formatearDuracion(h(48)), "2 d");
  });
});

describe("hace", () => {
  it("rotula la antigüedad", () => {
    assert.equal(hace(new Date(AHORA - min(12)).toISOString(), AHORA), "hace 12 min");
  });

  it("un reloj de cliente adelantado no produce 'hace -3 min'", () => {
    assert.equal(
      hace(new Date(AHORA + min(3)).toISOString(), AHORA),
      "hace menos de 1 min",
    );
  });

  it("una fecha que no se entiende no inventa nada", () => {
    assert.equal(hace("ayer por la tarde", AHORA), null);
  });
});

describe("caducidad", () => {
  it("cuenta lo que falta", () => {
    const c = caducidad(new Date(AHORA + h(3) + min(12)).toISOString(), AHORA);
    assert.ok(c);
    assert.equal(c.vencida, false);
    assert.equal(c.texto, "3 h 12 min");
    assert.equal(c.cerca, false);
    assert.equal(rotuloCaducidad(c), "Esta declaración caduca en 3 h 12 min.");
  });

  it("levanta la voz cuando quedan menos de 30 min", () => {
    const c = caducidad(new Date(AHORA + min(20)).toISOString(), AHORA);
    assert.equal(c?.cerca, true);
  });

  it("una declaración vencida se dice vencida, no se ignora", () => {
    const c = caducidad(new Date(AHORA - min(5)).toISOString(), AHORA);
    assert.ok(c);
    assert.equal(c.vencida, true);
    assert.equal(rotuloCaducidad(c), "Esta declaración caducó hace 5 min.");
  });

  it("sin caducidad la frase lo dice en vez de callarlo", () => {
    assert.equal(caducidad(null, AHORA), null);
    assert.equal(
      rotuloCaducidad(null),
      "Esta declaración no tiene caducidad registrada.",
    );
  });
});

describe("rotularProcedencia", () => {
  const base = { ausencia: null, ahora: AHORA };

  it("distingue lo declarado hoy de lo declarado por ti", () => {
    const declaracion = normalizarDeclaracion(DECLARADA)!;
    assert.equal(
      rotularProcedencia({ ...base, declaracion, actorId: "act_1" }).texto,
      "Declarado por ti hace 12 min",
    );
    assert.equal(
      rotularProcedencia({ ...base, declaracion, actorId: "act_9" }).texto,
      "Declarado por N. Robledo hace 12 min",
    );
  });

  it("el snapshot NUNCA se pinta como una declaración", () => {
    const declaracion = normalizarDeclaracion(SNAPSHOT)!;
    const r = rotularProcedencia({ ...base, declaracion });
    assert.equal(r.texto, "Snapshot REPS 2022");
    assert.equal(r.tono, "vieja");

    const viva = rotularProcedencia({
      ...base,
      declaracion: normalizarDeclaracion(DECLARADA)!,
    });
    assert.notEqual(r.tono, viva.tono);
    assert.notEqual(r.texto, viva.texto);
  });

  it("sin endpoint en core lo dice, y no finge un snapshot", () => {
    const r = rotularProcedencia({
      declaracion: null,
      ausencia: "sin-endpoint",
      ahora: AHORA,
    });
    assert.equal(r.tono, "ausente");
    assert.match(r.detalle, /404/);
    assert.match(r.detalle, /3\.3/);
  });

  it("core caído no es lo mismo que endpoint inexistente", () => {
    const caido = rotularProcedencia({
      declaracion: null,
      ausencia: "sin-core",
      ahora: AHORA,
    });
    const sinEndpoint = rotularProcedencia({
      declaracion: null,
      ausencia: "sin-endpoint",
      ahora: AHORA,
    });
    assert.notEqual(caido.texto, sinEndpoint.texto);
  });
});

describe("reducirCapacidad — escritura optimista", () => {
  const declaracion = normalizarDeclaracion(SNAPSHOT)!;
  const clave = claveCama("CAMAS-UCI Adultos");

  it("lo tocado se ve antes de que core conteste", () => {
    const estado = aplicar(conBase(declaracion), {
      tipo: "escribir",
      valor: { control: "operativo", operativo: "contingencia", motivo: "Emergencia interna" },
    });

    const v = proyectar(estado, AHORA);
    assert.equal(v.operativo, "contingencia");
    assert.equal(v.motivo, "Emergencia interna");
    assert.equal(v.operativoPendiente, true);
    assert.equal(v.hayPendientes, true);
  });

  it("si core rechaza, se revierte a lo confirmado Y se dice", () => {
    const estado = aplicar(
      conBase(declaracion),
      {
        tipo: "escribir",
        valor: { control: "operativo", operativo: "cerrado", motivo: "Obra" },
      },
      { tipo: "revertida", clave: "operativo", mensaje: "core respondió 404" },
    );

    const v = proyectar(estado, AHORA);
    assert.equal(v.operativo, "recibiendo", "vuelve a lo que core confirmó");
    assert.equal(v.operativoPendiente, false);
    assert.equal(v.operativoRevertido?.mensaje, "core respondió 404");
    assert.equal(v.hayRevertidos, true);
    // El intento se conserva para poder reintentarlo sin volver a tocarlo todo.
    assert.equal(
      v.operativoRevertido?.intento.control === "operativo" &&
        v.operativoRevertido.intento.operativo,
      "cerrado",
    );
  });

  it("confirmar reemplaza la base y limpia lo pendiente", () => {
    const confirmada = normalizarDeclaracion(DECLARADA)!;
    const estado = aplicar(
      conBase(declaracion),
      {
        tipo: "escribir",
        valor: { control: "operativo", operativo: "contingencia", motivo: "x" },
      },
      { tipo: "confirmada", clave: "operativo", declaracion: confirmada },
    );

    const v = proyectar(estado, AHORA, "act_1");
    assert.equal(v.operativoPendiente, false);
    assert.equal(v.hayPendientes, false);
    assert.equal(v.operativo, "contingencia");
    assert.equal(v.procedencia.tono, "declarada");
  });

  it("un fallo en una fila de camas no toca las otras filas", () => {
    const dosCamas = normalizarDeclaracion(DECLARADA)!;
    const otra = claveCama("CAMAS-Adultos");

    const estado = aplicar(
      conBase(dosCamas),
      { tipo: "escribir", valor: { control: "cama", tipo: "CAMAS-UCI Adultos", disponibles: 1 } },
      { tipo: "escribir", valor: { control: "cama", tipo: "CAMAS-Adultos", disponibles: 12 } },
      { tipo: "revertida", clave, mensaje: "core respondió 404" },
    );

    const v = proyectar(estado, AHORA);
    const uci = v.camas.find((c) => c.tipo === "CAMAS-UCI Adultos")!;
    const adultos = v.camas.find((c) => c.tipo === "CAMAS-Adultos")!;

    assert.equal(uci.disponibles, 2, "revertida a lo confirmado");
    assert.equal(uci.revertido?.mensaje, "core respondió 404");
    assert.equal(adultos.disponibles, 12, "la otra fila sigue en vuelo");
    assert.equal(adultos.pendiente, true);
    assert.equal(otra in estado.revertidos, false);
  });

  it("un refresco que llega en mitad de una escritura no borra lo tocado", () => {
    const estado = aplicar(
      conBase(declaracion),
      { tipo: "escribir", valor: { control: "cama", tipo: "CAMAS-UCI Adultos", disponibles: 9 } },
      // El polling trae lo de antes: core todavía no ha procesado el PUT.
      { tipo: "cargada", declaracion },
    );

    assert.equal(proyectar(estado, AHORA).camas[0].disponibles, 9);
  });

  it("reintentar borra el aviso del fallo anterior", () => {
    const estado = aplicar(
      conBase(declaracion),
      { tipo: "escribir", valor: { control: "operativo", operativo: "cerrado", motivo: "x" } },
      { tipo: "revertida", clave: "operativo", mensaje: "core respondió 404" },
      { tipo: "escribir", valor: { control: "operativo", operativo: "cerrado", motivo: "x" } },
    );

    const v = proyectar(estado, AHORA);
    assert.equal(v.operativoRevertido, null);
    assert.equal(v.operativoPendiente, true);
  });

  it("la caducidad se calcula sobre lo confirmado, nunca sobre lo optimista", () => {
    const estado = aplicar(conBase(declaracion), {
      tipo: "escribir",
      valor: { control: "operativo", operativo: "contingencia", motivo: "x" },
    });

    // SNAPSHOT no trae venceEn: tocar un botón no puede inventar un plazo que
    // ningún servidor va a hacer cumplir.
    assert.equal(proyectar(estado, AHORA).caducidad, null);
  });
});

describe("reducirCapacidad — ausencia de core", () => {
  it("sin declaración no hay camas que pintar, y la pantalla lo dice", () => {
    const estado = reducirCapacidad(CAPACIDAD_INICIAL, {
      tipo: "sin-declaracion",
      ausencia: "sin-endpoint",
    });

    const v = proyectar(estado, AHORA);
    assert.equal(v.operativo, null, "no se asume 'recibiendo'");
    assert.deepEqual(v.camas, []);
    assert.equal(v.procedencia.tono, "ausente");
    assert.equal(estado.cargando, false);
  });
});

describe("ajustarDisponibles", () => {
  it("nunca baja de cero: el servidor lo rechazaría", () => {
    assert.equal(ajustarDisponibles(0, -1, 14), 0);
    assert.equal(puedeAjustar(0, -1, 14), false);
  });

  it("nunca declara más libres que camas habilitadas", () => {
    assert.equal(ajustarDisponibles(14, 1, 14), 14);
    assert.equal(puedeAjustar(14, 1, 14), false);
  });

  it("suma y resta de a uno", () => {
    assert.equal(ajustarDisponibles(2, 1, 14), 3);
    assert.equal(ajustarDisponibles(2, -1, 14), 1);
  });

  it("sin total conocido sigue teniendo tope de cordura", () => {
    assert.equal(ajustarDisponibles(999, 1, null), 999);
    assert.equal(ajustarDisponibles(5, 1, null), 6);
  });
});

describe("nombreCama", () => {
  it("quita el prefijo REPS que se repite en todas las filas", () => {
    assert.equal(nombreCama("CAMAS-UCI Adultos"), "UCI Adultos");
    assert.equal(nombreCama("CAMAS-Salud Mental Adulto"), "Salud Mental Adulto");
  });

  it("un tipo sin prefijo se deja como está", () => {
    assert.equal(nombreCama("Urgencias-Camillas"), "Urgencias-Camillas");
  });
});
