/**
 * Tests de la frontera con core: renovación silenciosa, recuperación y el
 * hecho de que el token nunca pasa por JavaScript.
 *
 * `lib/api.ts` no tiene imports en tiempo de ejecución (solo `import type`, que
 * Node borra al despojar los tipos), así que `node --test` lo carga tal cual
 * sustituyendo `fetch`. Sin runner, sin jsdom, sin mocks de librería.
 *
 *   node --test lib/api.test.mts
 *
 * Se prueba comportamiento, no implementación: qué peticiones salen y en qué
 * orden, no qué banderas hay dentro del módulo. Las tres cosas que pueden hacer
 * daño de verdad:
 *
 *   - un bucle de refresh que le tira peticiones a un servidor ya caído
 *   - cinco redirecciones al login por un solo corte de sesión
 *   - una pantalla que dice "te mandamos un correo" sin haber mandado nada
 */

import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import * as api from "./api.ts";

type Respuesta = { status: number; cuerpo?: unknown } | "cae";

interface Llamada {
  metodo: string;
  ruta: string;
  init?: RequestInit;
}

let guion: Respuesta[] = [];
let llamadas: Llamada[] = [];

/** Atajo para los guiones largos: `repetir(5, {status: 401})`. */
function repetir(veces: number, r: Respuesta): Respuesta[] {
  return Array.from({ length: veces }, () => r);
}

/** Solo las rutas, que es lo que casi todos los tests miran. */
function rutas(): string[] {
  return llamadas.map((l) => `${l.metodo} ${l.ruta}`);
}

function responder(r: Respuesta) {
  if (r === "cae") return Promise.reject(new TypeError("Failed to fetch"));
  return Promise.resolve({
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    json: async () => r.cuerpo ?? {},
  } as Response);
}

globalThis.fetch = ((url: string, init?: RequestInit) => {
  llamadas.push({
    metodo: init?.method ?? "GET",
    ruta: new URL(url).pathname,
    init,
  });
  return responder(guion.shift() ?? { status: 200 });
}) as typeof fetch;

/**
 * Deja la frontera como recién cargada entre test y test.
 *
 * `api.ts` guarda dos banderas de módulo —si la renovación se agotó y si ya se
 * avisó de la sesión perdida—, así que un test que las enciende contaminaría al
 * siguiente. En vez de exponerlas solo para los tests, se usa la misma regla
 * que rige en producción: **una respuesta buena rearma las dos**. Una petición
 * que sale bien es el reinicio, y de paso lo comprueba.
 *
 * Registrar el gancho también lo rearma (`alPerderSesion`), y por eso cada test
 * que lo mira lo registra de nuevo.
 */
async function reiniciar() {
  guion = [{ status: 200, cuerpo: { autenticado: false } }];
  await api.sesion();
  guion = [];
  llamadas = [];
  api.alPerderSesion(null);
}

beforeEach(reiniciar);

describe("el token nunca pasa por JavaScript", () => {
  it("cada petición autenticada manda la cookie y ninguna manda Authorization", async () => {
    guion = repetir(4, { status: 200, cuerpo: { ok: true } });

    await api.sesion();
    await api.login({ correo: "n@hsc.co", password: "x" });
    await api.logout();
    await api.estado("caso_1");

    assert.equal(llamadas.length, 4);
    for (const { ruta, init } of llamadas) {
      assert.equal(
        init?.credentials,
        "include",
        `${ruta} sin credentials: core le responde 401 a todo`,
      );
      const cabeceras = Object.keys(init?.headers ?? {});
      assert.ok(
        !cabeceras.some((c) => c.toLowerCase() === "authorization"),
        `${ruta} manda Authorization: eso significa que el token está en JS`,
      );
    }
  });

  it("no hay almacén del navegador donde esconderlo", async () => {
    // Este test corre en Node: `document` y `localStorage` no existen. Si
    // alguien moviera el token ahí "por comodidad", `api.ts` reventaría al
    // cargarse y TODO este archivo se pondría rojo. Lo dejamos explícito para
    // que la garantía sea una aserción y no una casualidad del entorno.
    assert.equal(typeof (globalThis as { document?: unknown }).document, "undefined");
    assert.equal(
      typeof (globalThis as { localStorage?: unknown }).localStorage,
      "undefined",
    );

    guion = [{ status: 200, cuerpo: { autenticado: true } }];
    await api.sesion();
  });
});

describe("recuperar", () => {
  it("con el endpoint construido, dice que se envió", async () => {
    guion = [{ status: 200 }];
    assert.deepEqual(await api.recuperar("n@hsc.co"), { enviado: true });
  });

  it("con 404 NO dice que se envió: declara que no está construido", async () => {
    guion = [{ status: 404, cuerpo: { message: "Cannot POST /auth/recuperar" } }];
    assert.deepEqual(await api.recuperar("n@hsc.co"), {
      enviado: false,
      motivo: "no-construido",
    });
  });

  it("con core caído tampoco miente", async () => {
    guion = ["cae"];
    assert.deepEqual(await api.recuperar("n@hsc.co"), {
      enviado: false,
      motivo: "sin-core",
    });
  });

  it("nunca lanza: la pantalla no puede distinguir un correo de otro", async () => {
    for (const r of [{ status: 200 }, { status: 404 }, { status: 500 }, "cae" as const]) {
      guion = [r];
      await api.recuperar("cualquiera@x.co");
    }
  });

  it("responde lo mismo exista o no el correo: el cuerpo no se mira", async () => {
    // Core responde 200 en los dos casos (multitenancy §3.5). Aunque un core
    // mal escrito filtrara la diferencia en el cuerpo, aquí no llega a la
    // pantalla: el resultado es idéntico.
    guion = [{ status: 200, cuerpo: { existe: true, enviado: true } }];
    const conCuenta = await api.recuperar("existe@hsc.co");

    guion = [{ status: 200, cuerpo: { existe: false, enviado: false } }];
    const sinCuenta = await api.recuperar("nadie@hsc.co");

    assert.deepEqual(conCuenta, sinCuenta);
  });
});

describe("renovación silenciosa", () => {
  it("un 401 se renueva y se reintenta, y el usuario no se entera", async () => {
    let perdida = 0;
    api.alPerderSesion(() => perdida++);

    guion = [
      { status: 401 },
      { status: 200 }, // /auth/refresh
      { status: 200, cuerpo: { autenticado: true } },
    ];

    assert.deepEqual(await api.sesion(), { autenticado: true });
    assert.deepEqual(rutas(), [
      "GET /auth/sesion",
      "POST /auth/refresh",
      "GET /auth/sesion",
    ]);
    assert.equal(perdida, 0, "no debe sacar a nadie al login");
  });

  it("se reintenta UNA sola vez: dos 401 seguidos sacan al login", async () => {
    let perdida = 0;
    api.alPerderSesion(() => perdida++);

    guion = [{ status: 401 }, { status: 200 }, { status: 401 }];

    await assert.rejects(() => api.sesion(), { status: 401 });
    assert.equal(llamadas.length, 3, "un refresh y un reintento, no más");
    assert.equal(perdida, 1);
  });

  it("si el refresh falla, no se vuelve a intentar: nada de tormenta", async () => {
    guion = [{ status: 401 }, { status: 404 }];
    await assert.rejects(() => api.sesion(), { status: 401 });
    assert.deepEqual(rutas(), ["GET /auth/sesion", "POST /auth/refresh"]);

    // Segundo 401 con la renovación ya agotada: ni se molesta en pedirla.
    llamadas = [];
    guion = [{ status: 401 }];
    await assert.rejects(() => api.sesion(), { status: 401 });
    assert.deepEqual(rutas(), ["GET /auth/sesion"]);
  });

  it("veinte peticiones contra una renovación agotada no piden ni un refresh", async () => {
    guion = [{ status: 401 }, { status: 404 }];
    await assert.rejects(() => api.sesion(), { status: 401 });

    llamadas = [];
    guion = repetir(20, { status: 401 });
    await Promise.all(
      Array.from({ length: 20 }, () =>
        assert.rejects(() => api.sesion(), { status: 401 }),
      ),
    );

    assert.equal(
      rutas().filter((r) => r === "POST /auth/refresh").length,
      0,
      "el polling de la consola no puede martillear un servidor ya caído",
    );
    assert.equal(llamadas.length, 20, "una petición cada una, sin reintento");
  });

  it("una respuesta buena rearma la renovación para el próximo corte", async () => {
    guion = [{ status: 401 }, { status: 404 }];
    await assert.rejects(() => api.sesion(), { status: 401 });

    guion = [{ status: 200, cuerpo: { autenticado: true } }];
    await api.sesion();

    llamadas = [];
    guion = [{ status: 401 }, { status: 200 }, { status: 200, cuerpo: { autenticado: true } }];
    await api.sesion();
    assert.equal(llamadas.length, 3, "vuelve a intentar renovar");
  });

  it("cinco peticiones que caen a la vez comparten UN refresh", async () => {
    guion = [
      ...repetir(5, { status: 401 }),
      { status: 200 }, // el único /auth/refresh
      ...repetir(5, { status: 200, cuerpo: { autenticado: true } }),
    ];

    await Promise.all(Array.from({ length: 5 }, () => api.sesion()));

    assert.equal(
      rutas().filter((r) => r === "POST /auth/refresh").length,
      1,
      "un refresh, no cinco",
    );
    assert.equal(llamadas.length, 11, "5 fallidas + 1 refresh + 5 reintentos");
  });

  it("cinco peticiones que pierden la sesión mandan UN solo aviso al login", async () => {
    // Cinco `router.replace` seguidos es una pila de historial que deja al
    // usuario pulsando "atrás" cinco veces para salir del login.
    let perdida = 0;
    api.alPerderSesion(() => perdida++);

    guion = [...repetir(5, { status: 401 }), { status: 404 }]; // refresh caído

    await Promise.all(
      Array.from({ length: 5 }, () =>
        assert.rejects(() => api.sesion(), { status: 401 }),
      ),
    );

    assert.equal(perdida, 1);
  });

  it("cada corte nuevo vuelve a avisar: el silencio no es permanente", async () => {
    let perdida = 0;
    api.alPerderSesion(() => perdida++);

    guion = [{ status: 401 }, { status: 404 }];
    await assert.rejects(() => api.sesion(), { status: 401 });
    assert.equal(perdida, 1);

    // Vuelve a entrar y se cae otra vez más tarde.
    guion = [{ status: 200, cuerpo: { autenticado: true } }];
    await api.sesion();

    guion = [{ status: 401 }, { status: 404 }];
    await assert.rejects(() => api.sesion(), { status: 401 });
    assert.equal(perdida, 2);
  });
});

describe("transcribir", () => {
  const audio = () => new Blob(["…"], { type: "audio/webm" });

  it("un 401 renueva y reintenta el dictado, sin perderlo", async () => {
    guion = [
      { status: 401 },
      { status: 200 }, // /auth/refresh
      { status: 200, cuerpo: { texto: "paciente masculino" } },
    ];

    assert.deepEqual(await api.transcribir(audio()), {
      texto: "paciente masculino",
    });
    assert.deepEqual(rutas(), [
      "POST /voz/transcribir",
      "POST /auth/refresh",
      "POST /voz/transcribir",
    ]);
  });

  it("dos 401 seguidos no dan un tercer intento: no hay bucle", async () => {
    let perdida = 0;
    api.alPerderSesion(() => perdida++);

    guion = [{ status: 401 }, { status: 200 }, { status: 401 }];

    await assert.rejects(() => api.transcribir(audio()), { status: 401 });
    assert.equal(llamadas.length, 3);
    assert.equal(perdida, 1);
  });

  it("con la renovación agotada ni pide refresh", async () => {
    guion = [{ status: 401 }, { status: 404 }];
    await assert.rejects(() => api.sesion(), { status: 401 });

    llamadas = [];
    guion = [{ status: 401 }];
    await assert.rejects(() => api.transcribir(audio()), { status: 401 });
    assert.deepEqual(rutas(), ["POST /voz/transcribir"]);
  });

  it("un dictado que sale bien rearma la renovación igual que el resto", async () => {
    guion = [{ status: 401 }, { status: 404 }];
    await assert.rejects(() => api.sesion(), { status: 401 });

    guion = [{ status: 200, cuerpo: { texto: "ok" } }];
    await api.transcribir(audio());

    llamadas = [];
    guion = [{ status: 401 }, { status: 200 }, { status: 200, cuerpo: {} }];
    await api.sesion();
    assert.equal(llamadas.length, 3, "vuelve a intentar renovar");
  });

  it("manda el tipo real del audio, no JSON", async () => {
    guion = [{ status: 200, cuerpo: { texto: "" } }];
    await api.transcribir(new Blob(["…"], { type: "audio/mp4" }));

    const cabeceras = llamadas[0]?.init?.headers as Record<string, string>;
    assert.equal(cabeceras["Content-Type"], "audio/mp4");
  });
});

describe("login", () => {
  function cuerpoDe(indice = 0): unknown {
    return JSON.parse(String(llamadas[indice]?.init?.body ?? "null"));
  }

  it("manda correo y contraseña juntos", async () => {
    guion = [{ status: 200, cuerpo: { ok: true } }];
    await api.login({ correo: "n@hsc.co", password: "x" });
    assert.deepEqual(cuerpoDe(), { correo: "n@hsc.co", password: "x" });
  });

  it("el modo turno no inventa un correo", async () => {
    // `PULSO_AUTH_LEGACY=true`: core valida solo la contraseña compartida y no
    // tiene a quién atribuirle nada. Mandar un correo de mentira sería peor.
    guion = [{ status: 200, cuerpo: { ok: true } }];
    await api.loginTurno("pulso-demo");
    assert.deepEqual(cuerpoDe(), { password: "pulso-demo" });
  });

  it("un correo con dos organizaciones no entra: devuelve a cuál elegir", async () => {
    // Caso límite 1 de multitenancy §7. El token nunca lleva dos inquilinos.
    guion = [
      {
        status: 200,
        cuerpo: {
          ok: true,
          requiereOrganizacion: true,
          organizaciones: [{ id: "org_1" }, { id: "org_2" }],
        },
      },
    ];

    const res = await api.login({ correo: "medico@dos.co", password: "x" });
    assert.equal(res.requiereOrganizacion, true);
    assert.equal(res.organizaciones?.length, 2);
  });

  it("elegir organización manda solo el id, y a su propia ruta", async () => {
    guion = [{ status: 200, cuerpo: { ok: true } }];
    await api.elegirOrganizacion("org_2");
    assert.deepEqual(rutas(), ["POST /auth/organizacion"]);
    assert.deepEqual(cuerpoDe(), { organizacionId: "org_2" });
  });

  it("una contraseña mala no es una sesión vencida", async () => {
    // Un 401 del login es la respuesta, no una expiración: ni pide refresh
    // —que quemaría la renovación de toda la consola— ni llama al gancho que
    // manda al login estando ya en el login.
    let perdida = 0;
    api.alPerderSesion(() => perdida++);

    guion = [{ status: 401, cuerpo: { message: "Unauthorized" } }];
    await assert.rejects(() => api.login({ correo: "n@hsc.co", password: "mala" }), {
      status: 401,
    });

    assert.deepEqual(rutas(), ["POST /auth/login"]);
    assert.equal(perdida, 0);
  });

  it("tres contraseñas malas seguidas siguen dejando renovar después", async () => {
    // El escenario real: alguien la teclea mal tres veces con guantes y a la
    // cuarta entra. Si los fallos hubieran agotado la renovación, el primer
    // access vencido del turno lo sacaría al login sin intentar nada.
    guion = repetir(3, { status: 401, cuerpo: { message: "Unauthorized" } });
    for (const _ of [1, 2, 3]) {
      await assert.rejects(() => api.login({ correo: "n@hsc.co", password: "mala" }));
    }

    llamadas = [];
    guion = [{ status: 401 }, { status: 200 }, { status: 200, cuerpo: {} }];
    await api.sesion();
    assert.equal(llamadas.length, 3, "la renovación sigue armada");
  });
});
