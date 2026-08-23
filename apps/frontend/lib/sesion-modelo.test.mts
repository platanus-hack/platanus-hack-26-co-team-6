/**
 * Tests del modelo de sesión.
 *
 * `node --test` con type stripping, igual que `scripts/verificar-tipos.test.mts`:
 * el frontend no tiene runner y montar uno para un archivo costaría más que el
 * problema. Por eso `sesion-modelo.ts` no importa React ni `api.ts`.
 *
 *   node --test lib/sesion-modelo.test.mts
 *
 * Prueban comportamiento, no implementación: qué ve alguien que entra, no cómo
 * está escrito el parser.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  alcanzaSede,
  consolaDeRuta,
  DESTINO,
  destinoInterno,
  normalizarSesion,
  rutaPorRol,
  tieneRol,
} from "./sesion-modelo.ts";

/** Lo que core devuelve HOY, antes de 1.3. */
const LEGACY_DENTRO = { autenticado: true };

/** Lo que devolverá con actor real. */
const ACTOR_DENTRO = {
  autenticado: true,
  modo: "actor",
  actor: { id: "act_1", nombre: "N. Robledo", correo: "n@hsc.co" },
  organizacion: { id: "org_1", nombre: "Hospital San Carlos", tipo: "ips" },
  roles: ["jefe_urgencias"],
  sedes: ["110010123401"],
};

describe("normalizarSesion", () => {
  it("lee la respuesta de hoy sin inventar roles", () => {
    const s = normalizarSesion(LEGACY_DENTRO);
    assert.equal(s.autenticado, true);
    assert.equal(s.modo, "legacy");
    assert.deepEqual(s.roles, []);
    assert.equal(s.actor, null);
  });

  it("lee la respuesta con actor real", () => {
    const s = normalizarSesion(ACTOR_DENTRO);
    assert.equal(s.modo, "actor");
    assert.equal(s.actor?.id, "act_1");
    assert.equal(s.organizacion?.id, "org_1");
    assert.deepEqual(s.roles, ["jefe_urgencias"]);
    assert.deepEqual(s.sedes, ["110010123401"]);
  });

  it("infiere modo actor si core manda actor pero olvida el campo modo", () => {
    const sinModo: Record<string, unknown> = { ...ACTOR_DENTRO };
    delete sinModo.modo;
    assert.equal(normalizarSesion(sinModo).modo, "actor");
  });

  it("un cuerpo que no entiende es 'no hay sesión', nunca 'hay sesión rara'", () => {
    for (const basura of [null, undefined, 42, "ok", {}, { autenticado: "si" }]) {
      const s = normalizarSesion(basura);
      assert.equal(s.autenticado, false, `con ${JSON.stringify(basura)}`);
      assert.equal(s.modo, "legacy");
      assert.deepEqual(s.roles, []);
    }
  });

  it("descarta un rol que este build no conoce en vez de reventar", () => {
    const s = normalizarSesion({
      ...ACTOR_DENTRO,
      roles: ["jefe_urgencias", "rol_del_futuro"],
    });
    assert.deepEqual(s.roles, ["jefe_urgencias"]);
  });

  it("una sola organización también llena la lista de organizaciones", () => {
    assert.equal(normalizarSesion(ACTOR_DENTRO).organizaciones.length, 1);
  });

  it("conserva las varias organizaciones del caso límite 1", () => {
    const s = normalizarSesion({
      ...ACTOR_DENTRO,
      organizaciones: [
        { id: "org_1", nombre: "Hospital San Carlos" },
        { id: "org_2", nombre: "Clínica del Norte" },
      ],
    });
    assert.equal(s.organizaciones.length, 2);
  });

  it("campos nuevos de un core más nuevo no rompen nada", () => {
    const s = normalizarSesion({ ...ACTOR_DENTRO, dosFactores: true, sid: "x" });
    assert.equal(s.autenticado, true);
    assert.deepEqual(s.roles, ["jefe_urgencias"]);
  });
});

describe("tieneRol", () => {
  it("en modo actor exige el rol", () => {
    const s = normalizarSesion(ACTOR_DENTRO);
    assert.equal(tieneRol(s, ["jefe_urgencias"]), true);
    assert.equal(tieneRol(s, ["paramedico"]), false);
    assert.equal(tieneRol(s, ["paramedico", "jefe_urgencias"]), true);
  });

  it("en modo legacy no bloquea: la contraseña de turno no trae roles", () => {
    const s = normalizarSesion(LEGACY_DENTRO);
    assert.equal(tieneRol(s, ["regulador_crue"]), true);
  });
});

describe("alcanzaSede", () => {
  it("alcance vacío es toda la organización", () => {
    const s = normalizarSesion({ ...ACTOR_DENTRO, sedes: [] });
    assert.equal(alcanzaSede(s, "110010123401"), true);
  });

  it("con alcance, una sede ajena queda fuera", () => {
    const s = normalizarSesion(ACTOR_DENTRO);
    assert.equal(alcanzaSede(s, "110010123401"), true);
    assert.equal(alcanzaSede(s, "110019999999"), false);
  });
});

describe("DESTINO", () => {
  it("cada rol de la tarea 1.4 tiene su consola declarada", () => {
    // La tabla del paso 4 de la tarea, literal. Que `/panel` y `/admin` no
    // estén construidas todavía se resuelve en `rutaPorRol`; el destino que le
    // toca a cada rol no cambia por eso, y aquí queda escrito.
    assert.deepEqual(
      {
        paramedico: DESTINO.paramedico,
        jefe_urgencias: DESTINO.jefe_urgencias,
        regulador_crue: DESTINO.regulador_crue,
        admin_organizacion: DESTINO.admin_organizacion,
        admin_plataforma: DESTINO.admin_plataforma,
      },
      {
        paramedico: "/campo",
        jefe_urgencias: "/hospital",
        regulador_crue: "/crue",
        admin_organizacion: "/panel",
        admin_plataforma: "/admin",
      },
    );
  });
});

describe("rutaPorRol", () => {
  it("manda a cada rol a su consola", () => {
    assert.equal(rutaPorRol(["paramedico"]).destino, "/campo");
    assert.equal(rutaPorRol(["jefe_urgencias"]).destino, "/hospital");
    assert.equal(rutaPorRol(["regulador_crue"]).destino, "/crue");
  });

  it("las consolas que faltan se declaran una por una", () => {
    for (const [rol, ruta] of [
      ["admin_organizacion", "/panel"],
      ["admin_plataforma", "/admin"],
    ] as const) {
      const r = rutaPorRol([rol]);
      assert.equal(r.pendiente, ruta, `${rol} debe declarar ${ruta}`);
      assert.notEqual(r.destino, ruta, "no se manda a nadie a un 404");
    }
  });

  it("con varios roles gana el más operativo", () => {
    assert.equal(
      rutaPorRol(["admin_organizacion", "paramedico"]).destino,
      "/campo",
    );
  });

  it("sin roles (modo legacy) cae al destino por defecto", () => {
    const r = rutaPorRol([]);
    assert.equal(r.destino, "/campo");
    assert.equal(r.pendiente, undefined);
  });

  it("una consola sin construir se declara, no se esconde", () => {
    const r = rutaPorRol(["admin_organizacion"]);
    assert.equal(r.pendiente, "/panel");
    assert.equal(r.destino, "/campo");
  });

  it("si tiene otro rol con consola de verdad, ahí va, y lo dice igual", () => {
    const r = rutaPorRol(["admin_plataforma", "regulador_crue"]);
    assert.equal(r.destino, "/crue");
    assert.equal(r.pendiente, undefined);
  });
});

describe("consolaDeRuta", () => {
  it("recorta a la consola", () => {
    assert.equal(consolaDeRuta("/campo"), "/campo");
    assert.equal(consolaDeRuta("/hospital/recepcion/abc"), "/hospital");
    assert.equal(consolaDeRuta("/"), "/");
  });
});

describe("destinoInterno", () => {
  it("deja pasar la ruta donde se cayó la sesión", () => {
    assert.equal(destinoInterno("/hospital"), "/hospital");
    assert.equal(destinoInterno("/campo?caso=abc"), "/campo?caso=abc");
  });

  it("no hay destino cuando nadie lo pidió", () => {
    for (const nada of [null, undefined, ""]) {
      assert.equal(destinoInterno(nada), null);
    }
  });

  it("un destino fuera de PULSO no sale del login", () => {
    // Todas estas mandan a otro sitio con la sesión recién abierta, que es el
    // regalo de phishing clásico. Las dos del medio empiezan por "/" y aun así
    // el navegador las lee como URL absolutas.
    for (const fuera of [
      "https://evil.co",
      "//evil.co",
      "/\\evil.co",
      "javascript:alert(1)",
      "evil.co",
    ]) {
      assert.equal(destinoInterno(fuera), null, `debe rechazar ${fuera}`);
    }
  });
});
