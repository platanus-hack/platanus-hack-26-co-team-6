/**
 * La revisión humana espeja la puerta de coherencia de core
 * (`clinical-policy.ts`): si esto deja confirmar algo que core rechaza, el
 * paramédico llena un formulario para estrellarse contra un 4xx. Estos tests
 * fijan ese espejo.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  confirmar,
  faltantes,
  partirSignos,
  precargar,
} from "./revision-clinica.ts";
import type { Caso } from "./types";

const CASO: Caso = {
  id: "c1",
  resumen: "dolor toracico",
  triage: 3,
  dxCie10: null,
  dxDescripcion: "Cuadro clínico no clasificado",
  serviciosRequeridos: [],
  complejidadRequerida: "media",
  edad: null,
  sexo: "desconocido",
  signosAlarma: [],
  requiereMedicoABordo: false,
  confianza: 0.35,
  textoCrudo: "dolor toracico",
  origen: { lat: 4.6, lng: -74.08 },
  tipoMovil: "TAB",
  unidad: null,
  creadoEn: "2026-08-23T00:00:00Z",
};

describe("precargar", () => {
  it("el placeholder de la heurística no se precarga como hallazgo", () => {
    // "Cuadro clínico no clasificado" es la forma que tiene la heurística de
    // decir "no sé". Precargarlo invitaría a confirmarlo tal cual.
    assert.equal(precargar(CASO).hallazgo, "");
    assert.equal(
      precargar({ ...CASO, dxDescripcion: "IAM con supradesnivel" }).hallazgo,
      "IAM con supradesnivel",
    );
  });
});

describe("partirSignos", () => {
  it("limpia comas dobles y espacios", () => {
    assert.deepEqual(partirSignos(" hipotensión, palidez ,,"), [
      "hipotensión",
      "palidez",
    ]);
    assert.deepEqual(partirSignos(""), []);
  });
});

describe("faltantes", () => {
  it("sin hallazgo no se confirma", () => {
    assert.equal(faltantes(precargar(CASO)).length, 1);
  });

  it("triage 1-2 exige un signo que lo justifique — el espejo de core", () => {
    const campos = { ...precargar(CASO), hallazgo: "politrauma", triage: 1 as const };
    assert.equal(faltantes(campos).length, 1);
    assert.equal(
      faltantes({ ...campos, signosAlarma: ["hipotensión"] }).length,
      0,
    );
  });

  it("triage 3+ con hallazgo alcanza", () => {
    assert.deepEqual(faltantes({ ...precargar(CASO), hallazgo: "apendicitis" }), []);
  });
});

describe("confirmar", () => {
  const campos = {
    edad: 60,
    sexo: "M" as const,
    triage: 2 as const,
    hallazgo: "  IAM con supradesnivel  ",
    signosAlarma: ["diaforesis"],
  };

  it("la confianza del parser NO se toca: 0.35 queda en la auditoría", () => {
    const c = confirmar(CASO, campos, "AMB-01", "2026-08-23T01:00:00Z");
    assert.equal(c.confianza, 0.35);
    assert.deepEqual(c.revisionHumana, { por: "AMB-01", en: "2026-08-23T01:00:00Z" });
  });

  it("aplica los campos y recorta el hallazgo", () => {
    const c = confirmar(CASO, campos, "AMB-01", "2026-08-23T01:00:00Z");
    assert.equal(c.dxDescripcion, "IAM con supradesnivel");
    assert.equal(c.edad, 60);
    assert.equal(c.triage, 2);
  });

  it("sin servicios cae al piso de urgencias (110): /match filtra con esto", () => {
    const c = confirmar(CASO, campos, "AMB-01", "2026-08-23T01:00:00Z");
    assert.deepEqual(c.serviciosRequeridos, [110]);
    const conServicios = confirmar(
      { ...CASO, serviciosRequeridos: [110, 325] },
      campos, "AMB-01", "2026-08-23T01:00:00Z",
    );
    assert.deepEqual(conServicios.serviciosRequeridos, [110, 325]);
  });
});
