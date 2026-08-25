/**
 * Lo que se prueba aquí es una pantalla, no una función.
 *
 * El bug que originó este archivo no fue un cálculo mal hecho: fue un `catch`
 * que pintaba "Core no responde. Reintentar" ante un 404, y mandó a buscar
 * durante un rato un core caído que estaba vivo. Por eso los tests miran dos
 * cosas que normalmente no se prueban —qué dice el texto y si aparece el
 * botón— y una que sí: que ningún fallo se disfrace de otro.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ErrorApi } from "./api.ts";
import { clasificar, describir, type Fallo } from "./fallo-core.ts";

describe("clasificar", () => {
  it("un fallo de fetch no es una respuesta: es la red", () => {
    // `fetch` rechaza con TypeError cuando no hubo respuesta que interpretar.
    assert.deepEqual(clasificar(new TypeError("Failed to fetch"), "/x"), {
      clase: "red",
    });
    assert.deepEqual(clasificar(undefined, "/x"), { clase: "red" });
  });

  it("404 es 'este core no tiene el panel', no 'core caído'", () => {
    // El caso real: core arriba, pero el proceso arrancó antes de que el
    // módulo admin existiera, así que /admin/acceso no está registrada.
    assert.deepEqual(clasificar(new ErrorApi("core respondió 404", 404), "/equipo"), {
      clase: "sin-panel",
      ruta: "/equipo",
    });
    // Y el texto nombra ESA ruta: la pantalla de /equipo no habla de /admin.
    assert.match(
      describir({ clase: "sin-panel", ruta: "/equipo" }).detalle,
      /\/equipo/,
    );
  });

  it("403 es del rol, y trae el mensaje de core", () => {
    const f = clasificar(new ErrorApi("No eres admin de plataforma", 403), "/x");
    assert.equal(f.clase, "prohibido");
    assert.match(describir(f).detalle, /No eres admin de plataforma/);
  });

  it("401 es la sesión: la redirección ya la disparó `pedir`", () => {
    assert.deepEqual(clasificar(new ErrorApi("Sesión expirada", 401), "/x"), {
      clase: "sesion",
    });
  });

  it("5xx conserva el status: sin él no se puede reportar el fallo", () => {
    assert.deepEqual(clasificar(new ErrorApi("boom", 503), "/x"), {
      clase: "core-roto",
      status: 503,
      mensaje: "boom",
    });
  });
});

describe("describir", () => {
  const TODOS: Fallo[] = [
    { clase: "red" },
    { clase: "sesion" },
    { clase: "prohibido", mensaje: "no puedes" },
    { clase: "sin-panel", ruta: "/x" },
    { clase: "core-roto", status: 500, mensaje: "boom" },
  ];

  it("cada fallo tiene su propio título: ninguno se disfraza de otro", () => {
    const titulos = TODOS.map((f) => describir(f).titulo);
    assert.equal(new Set(titulos).size, TODOS.length, titulos.join(" | "));
  });

  it("solo se ofrece reintentar cuando reintentar puede cambiar algo", () => {
    // 403 y sesión expirada no cambian por volver a pedir. Ofrecer el botón
    // ahí es invitar a pulsarlo para siempre — que es justo lo que pasaba.
    assert.equal(describir({ clase: "prohibido", mensaje: "x" }).reintentar, false);
    assert.equal(describir({ clase: "sesion" }).reintentar, false);
    assert.equal(describir({ clase: "red" }).reintentar, true);
    assert.equal(describir({ clase: "sin-panel", ruta: "/x" }).reintentar, true);
  });

  it("'sin panel' dice cómo salir de ahí: reiniciar core", () => {
    assert.match(describir({ clase: "sin-panel", ruta: "/x" }).detalle, /reinícialo/i);
  });

  it("solo 'red' culpa a core de no responder", () => {
    const culpan = TODOS.filter((f) => /no responde/i.test(describir(f).titulo));
    assert.deepEqual(culpan, [{ clase: "red" }]);
  });
});
