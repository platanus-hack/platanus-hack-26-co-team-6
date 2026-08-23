/**
 * Tests del modelo del expediente forense.
 *
 * `node --test` con type stripping, igual que `sesion-modelo.test.mts`: el
 * frontend no tiene runner y montar uno costaría más que el problema. Por eso
 * `auditoria-modelo.ts` no importa React ni `api.ts`.
 *
 *   node --test lib/auditoria-modelo.test.mts
 *
 * Prueban comportamiento: qué ve quien abre el expediente, no cómo está
 * escrito el parser.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  aJsonExportable,
  candidatosDe,
  descartadosDe,
  desgloseEnMinutos,
  enlazarCorrecciones,
  esConsulta,
  esHumano,
  etiquetaActor,
  etiquetaTipo,
  horaDe,
  leerExpediente,
  marcaActor,
  nombreArchivo,
  ordenarLinea,
  politicaPorRol,
  procedenciaEta,
  type EvidenciaExpediente,
  type FilaExpediente,
} from "./auditoria-modelo.ts";

const PARAMEDICO = { id: "turno:amb014", nombre: "J. Álvarez", tipo: "humano" as const };
const VOZ = { id: "svc:voz", nombre: null, tipo: "servicio" as const };
const SISTEMA = { id: "sys:routing", nombre: null, tipo: "sistema" as const };

function fila(over: Partial<FilaExpediente> = {}): FilaExpediente {
  return {
    clave: over.clave ?? `evento:${over.eventoId ?? 1}`,
    fuente: "evento_caso",
    eventoId: 1,
    ocurridoEn: "2026-08-22T22:14:00.000Z",
    tipo: "llegada_puerta",
    actor: PARAMEDICO,
    organizacionId: null,
    codigoSede: null,
    movilId: null,
    detalle: {},
    corrigeA: null,
    redactados: [],
    ...over,
  };
}

describe("ordenarLinea", () => {
  it("cuenta la historia hacia adelante", () => {
    const orden = ordenarLinea([
      fila({ eventoId: 3, ocurridoEn: "2026-08-22T22:30:00.000Z" }),
      fila({ eventoId: 1, ocurridoEn: "2026-08-22T22:10:00.000Z" }),
      fila({ eventoId: 2, ocurridoEn: "2026-08-22T22:20:00.000Z" }),
    ]).map((f) => f.eventoId);
    assert.deepEqual(orden, [1, 2, 3]);
  });

  it("lo que no tiene hora sellada va primero, no al final", () => {
    // La evidencia del ruteo ocurrió antes de que alguien despachara; ponerla
    // al final contaría la historia al revés.
    const orden = ordenarLinea([
      fila({ eventoId: 1, ocurridoEn: "2026-08-22T22:10:00.000Z" }),
      fila({
        eventoId: null,
        clave: "evidencia:match",
        ocurridoEn: null,
        tipo: "match_calculado",
      }),
    ]).map((f) => f.clave);
    assert.deepEqual(orden, ["evidencia:match", "evento:1"]);
  });

  it("dos eventos del mismo instante salen siempre en el mismo orden", () => {
    const misma = "2026-08-22T22:14:00.000Z";
    const filas = [
      fila({ eventoId: 2, ocurridoEn: misma, tipo: "aceptado" }),
      fila({ eventoId: 1, ocurridoEn: misma, tipo: "despachado" }),
    ];
    const a = ordenarLinea(filas).map((f) => f.eventoId);
    const b = ordenarLinea([...filas].reverse()).map((f) => f.eventoId);
    assert.deepEqual(a, [1, 2]);
    assert.deepEqual(b, a, "una auditoría que no es reproducible no sirve");
  });

  it("no muta la lista que recibe", () => {
    const filas = [fila({ eventoId: 2 }), fila({ eventoId: 1 })];
    ordenarLinea(filas);
    assert.equal(filas[0].eventoId, 2);
  });
});

describe("enlazarCorrecciones", () => {
  const original = fila({
    eventoId: 10,
    detalle: { hora: "22:14" },
    ocurridoEn: "2026-08-22T22:14:00.000Z",
  });
  const correccion = fila({
    eventoId: 11,
    corrigeA: 10,
    detalle: { hora: "22:11" },
    ocurridoEn: "2026-08-22T22:19:00.000Z",
  });

  it("el error se ve: la fila corregida se queda y se marca", () => {
    const [vieja, nueva] = enlazarCorrecciones([original, correccion]);
    assert.equal(vieja.obsoleta, true);
    assert.deepEqual(vieja.corregidaPor, [11]);
    assert.equal(nueva.esCorreccion, true);
    assert.equal(nueva.obsoleta, false);
  });

  it("un evento sin correcciones no queda marcado de nada", () => {
    const [sola] = enlazarCorrecciones([original]);
    assert.equal(sola.obsoleta, false);
    assert.equal(sola.esCorreccion, false);
    assert.deepEqual(sola.corregidaPor, []);
  });

  it("dos correcciones sobre el mismo evento se apilan", () => {
    const otra = fila({ eventoId: 12, corrigeA: 10 });
    const [vieja] = enlazarCorrecciones([original, correccion, otra]);
    assert.deepEqual(vieja.corregidaPor, [11, 12]);
  });

  it("una corrección a algo que no está en el expediente sigue siendo corrección", () => {
    const huerfana = fila({ eventoId: 20, corrigeA: 999 });
    const [sola] = enlazarCorrecciones([huerfana]);
    assert.equal(sola.esCorreccion, true);
  });
});

describe("horaDe y el texto de la corrección", () => {
  it("manda la hora que el evento declara, no la del sello", () => {
    // Corregir a las 22:19 significa que la llegada fue a las 22:11.
    const f = fila({ detalle: { hora: "22:11" }, ocurridoEn: "2026-08-22T22:19:00.000Z" });
    assert.equal(horaDe(f), "22:11");
  });

  it("sin hora declarada usa la del sello", () => {
    const f = fila({ ocurridoEn: "2026-08-22T22:19:00.000Z", detalle: {} });
    assert.match(horaDe(f), /^\d{2}:\d{2}$/);
  });

  it("sin hora de ningún tipo no se inventa una", () => {
    assert.equal(horaDe(fila({ ocurridoEn: null, detalle: {} })), "—");
  });
});

describe("actor humano contra actor servicio", () => {
  it("un servicio nunca se lee como una persona", () => {
    assert.match(etiquetaActor(VOZ), /servicio/);
    assert.equal(esHumano(VOZ), false);
    assert.equal(marcaActor(VOZ), "SERVICIO");
  });

  it("una decisión de la máquina se declara como tal", () => {
    assert.match(etiquetaActor(SISTEMA), /sistema/);
    assert.equal(marcaActor(SISTEMA), "SISTEMA");
  });

  it("la persona sale con su nombre", () => {
    assert.equal(etiquetaActor(PARAMEDICO), "J. Álvarez");
    assert.equal(marcaActor(PARAMEDICO), "PERSONA");
  });

  it("un humano sin nombre cae al id, no a un vacío", () => {
    assert.equal(etiquetaActor({ id: "turno:operador", nombre: null, tipo: "humano" }), "turno:operador");
  });
});

describe("politicaPorRol", () => {
  it("el dictado y el origen no salen para nadie", () => {
    for (const rol of ["auditor", "regulador_crue", "admin_organizacion"]) {
      const p = politicaPorRol(rol);
      assert.ok(p.claves.includes("textoCrudo"), `${rol} debe redactar el dictado`);
      assert.ok(p.claves.includes("origen"), `${rol} debe redactar el origen`);
    }
  });

  it("el auditor externo no ve la narrativa clínica; el regulador sí", () => {
    assert.ok(politicaPorRol("auditor").claves.includes("resumen"));
    assert.ok(!politicaPorRol("regulador_crue").claves.includes("resumen"));
  });

  it("un rol desconocido no gana privilegios", () => {
    // Ante la duda, menos: cae en la política del operativo, que igual tacha
    // toda la PII absoluta. Nunca en "no se tacha nada".
    assert.ok(politicaPorRol("rol_del_futuro").claves.includes("textoCrudo"));
  });
});

describe("la evidencia del ruteo", () => {
  const evidencia: EvidenciaExpediente = {
    estado: "matched",
    modelVersion: "routing-v1",
    configVersion: "routing-config-v1",
    selectedDestination: "S-1",
    etaProvenance: "haversine_fallback",
    minuteBreakdown: { ruta: 12, riesgoRechazo: 3, espera: 4, bono: -2 },
    fingerprint: "abc",
    inputs: null,
    candidates: [
      { sede: { codigo: "S-1", nombre: "San Carlos" }, rank: 1, etaMin: 12, motivoDescarte: null },
      {
        sede: { codigo: "S-2", nombre: "Clínica Norte" },
        rank: 0,
        etaMin: 8,
        motivoDescarte: "No tiene Hemodinamia e intervencionismo",
      },
    ],
  };

  it("marca cuál fue el elegido", () => {
    const elegidos = candidatosDe(evidencia).filter((c) => c.elegido);
    assert.deepEqual(elegidos.map((c) => c.codigo), ["S-1"]);
  });

  it("los descartados salen con su motivo: son parte del producto", () => {
    const fuera = descartadosDe(evidencia);
    assert.equal(fuera.length, 1);
    assert.match(fuera[0].motivoDescarte ?? "", /Hemodinamia/);
  });

  it("el desglose se lee en minutos y ordenado por peso", () => {
    const d = desgloseEnMinutos(evidencia);
    assert.deepEqual(d[0], { concepto: "ruta", minutos: 12 });
    assert.equal(d.length, 4);
  });

  it("dice si el ETA venía de tráfico real o de una línea recta", () => {
    assert.match(procedenciaEta(evidencia), /línea recta/);
    assert.match(procedenciaEta({ ...evidencia, etaProvenance: "mapbox" }), /tráfico real/);
    assert.equal(procedenciaEta({ ...evidencia, etaProvenance: null }), "sin registrar");
  });

  it("un candidato viejo al que le faltan campos no tumba el expediente", () => {
    const roto = candidatosDe({ ...evidencia, candidates: [{}, null] });
    assert.equal(roto.length, 2);
    assert.equal(roto[0].codigo, "—");
  });

  it("sin evidencia no hay nada que pintar, y no revienta", () => {
    assert.deepEqual(candidatosDe(null), []);
    assert.deepEqual(desgloseEnMinutos(null), []);
  });
});

describe("leerExpediente", () => {
  const bueno = {
    casoId: "caso-1",
    generadoEn: "2026-08-22T22:30:00.000Z",
    solicitante: {
      id: "turno:auditora",
      tipo: "humano",
      roles: ["auditor"],
      organizacionId: null,
      rolEfectivo: "auditor",
      identidadProvisional: true,
    },
    politicaRedaccion: { rol: "auditor", claves: ["textoCrudo"], motivo: "…" },
    filas: [
      {
        clave: "evento:1",
        fuente: "evento_caso",
        eventoId: 1,
        ocurridoEn: "2026-08-22T22:14:00.000Z",
        tipo: "override_crue",
        actor: { id: "turno:operador", nombre: null, tipo: "humano" },
        organizacionId: null,
        codigoSede: "S-1",
        movilId: null,
        detalle: { justificacion: "la única con hemodinamia" },
        corrigeA: null,
        redactados: [],
      },
    ],
    evidencia: null,
    registro: { modo: "memoria", advertencia: "se pierde al reiniciar" },
    cobertura: { tiposCableados: ["override_crue"], nota: "faltan 20" },
  };

  it("lee la respuesta de core", () => {
    const e = leerExpediente(bueno);
    assert.equal(e?.casoId, "caso-1");
    assert.equal(e?.filas.length, 1);
    assert.equal(e?.registro.modo, "memoria");
  });

  it("un cuerpo que no se entiende es 'no hay expediente', no medio expediente", () => {
    for (const basura of [null, undefined, 42, "ok", {}, { casoId: 1 }]) {
      assert.equal(leerExpediente(basura), null, `con ${JSON.stringify(basura)}`);
    }
  });

  it("campos nuevos de un core más nuevo no rompen nada", () => {
    const e = leerExpediente({ ...bueno, firmaDigital: "x", filas: bueno.filas });
    assert.equal(e?.filas.length, 1);
  });

  it("una fila incompleta se lee sin inventar un actor humano con nombre", () => {
    const e = leerExpediente({ ...bueno, filas: [{ tipo: "aceptado" }] });
    assert.equal(e?.filas[0].actor.nombre, null);
    assert.equal(e?.filas[0].ocurridoEn, null);
  });

  it("un modo de registro desconocido se lee como memoria, no como persistido", () => {
    // Ante la duda, la lectura pesimista: decir "esto está guardado" cuando no
    // se sabe es la mentira cara.
    const e = leerExpediente({ ...bueno, registro: { modo: "quien sabe" } });
    assert.equal(e?.registro.modo, "memoria");
  });
});

describe("exportación", () => {
  it("el JSON lleva quién lo leyó, la redacción aplicada y los huecos declarados", () => {
    const e = leerExpediente({
      casoId: "caso-1",
      generadoEn: "2026-08-22T22:30:00.000Z",
      solicitante: { id: "turno:auditora", roles: ["auditor"], rolEfectivo: "auditor" },
      politicaRedaccion: { rol: "auditor", claves: ["textoCrudo"], motivo: "porque sí" },
      filas: [],
      evidencia: null,
      registro: { modo: "memoria", advertencia: "ojo" },
      cobertura: { tiposCableados: [], nota: "faltan 20 eventos" },
    })!;
    const json = JSON.parse(aJsonExportable(e));
    assert.equal(json.leidoPor.rolEfectivo, "auditor");
    assert.equal(json.redaccion.claves[0], "textoCrudo");
    assert.match(json.cobertura.nota, /faltan 20/);
    assert.ok(json.exportadoEn, "un archivo suelto dice cuándo salió");
  });

  it("el nombre del archivo no lleva PII", () => {
    const nombre = nombreArchivo("caso-1", "json");
    assert.match(nombre, /^pulso-expediente-caso-1-[\d-]+\.json$/);
  });
});

describe("etiquetas", () => {
  it("cada tipo se lee en español", () => {
    assert.equal(etiquetaTipo("override_crue"), "override del CRUE");
    assert.equal(etiquetaTipo("lectura_auditoria"), "consulta de auditoría");
  });

  it("un tipo que este build no conoce se muestra igual, sin guiones bajos", () => {
    assert.equal(etiquetaTipo("tipo_del_futuro"), "tipo del futuro");
  });

  it("las consultas se distinguen de los hechos del traslado", () => {
    assert.equal(esConsulta("lectura_auditoria"), true);
    assert.equal(esConsulta("entrega"), false);
  });
});
