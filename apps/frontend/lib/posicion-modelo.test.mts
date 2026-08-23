/**
 * Tests del modelo de posición y cobertura.
 *
 * `node --test` con type stripping, igual que `sesion-modelo.test.mts`: el
 * frontend no tiene runner y montar uno para dos archivos costaría más que el
 * problema. Por eso `posicion-modelo.ts` no importa React ni `api.ts`.
 *
 *   node --test lib/posicion-modelo.test.mts
 *
 * Prueban comportamiento: a quién se rastrea y a quién no, qué se le dice al
 * paramédico cuando no se le rastrea, y cómo se ve la flota por zona.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  agruparPorLocalidad,
  antiguedadS,
  contar,
  debeEnviar,
  decidirRastreo,
  frescuraDe,
  INTERVALO_REPORTE_MS,
  MENSAJE_SIN_RASTREO,
  SIN_LOCALIDAD,
  textoAntiguedad,
  textoPrecision,
  type MovilCobertura,
} from "./posicion-modelo.ts";

const EN_SERVICIO = {
  casoAbierto: true,
  movilId: "AMB-014",
  estadoGeo: "ok",
} as const;

const AHORA = Date.parse("2026-08-22T15:00:00.000Z");
const haceS = (s: number) => new Date(AHORA - s * 1000).toISOString();

const movil = (p: Partial<MovilCobertura> & { id: string }): MovilCobertura => ({
  organizacionId: "org-demo",
  tipo: "TAB",
  tipoVerificado: false,
  disponible: true,
  posicion: null,
  localidad: null,
  ...p,
});

const conPosicion = (reportadoEn: string) => ({
  lat: 4.65,
  lng: -74.06,
  precisionM: 20,
  velocidadKmh: 0,
  reportadoEn,
});

describe("decidirRastreo", () => {
  it("rastrea cuando hay caso abierto, móvil declarado y GPS bueno", () => {
    assert.deepEqual(decidirRastreo(EN_SERVICIO), { rastreando: true });
  });

  it("SIN CASO ABIERTO NO SE RASTREA — aunque todo lo demás esté perfecto", () => {
    // La casilla dura de la tarea: no drenar la batería y, sobre todo, no
    // rastrear a alguien que no está atendiendo a nadie.
    const r = decidirRastreo({ ...EN_SERVICIO, casoAbierto: false });
    assert.equal(r.rastreando, false);
    assert.equal(r.rastreando === false && r.motivo, "sin-caso");
  });

  it('"sin caso" gana sobre cualquier problema de GPS', () => {
    // Si no hay caso, que el GPS no enganche es irrelevante y decirlo confunde.
    const r = decidirRastreo({
      casoAbierto: false,
      movilId: null,
      estadoGeo: "denegado",
    });
    assert.equal(r.rastreando === false && r.motivo, "sin-caso");
  });

  it("sin móvil declarado no se reporta: el CRUE no sabría de quién es el pin", () => {
    const r = decidirRastreo({ ...EN_SERVICIO, movilId: null });
    assert.equal(r.rastreando === false && r.motivo, "sin-unidad");
  });

  it("cada estado del GPS tiene su motivo, y todos tienen mensaje", () => {
    const casos = [
      ["pidiendo", "buscando"],
      ["denegado", "sin-permiso"],
      ["no-soportado", "sin-soporte"],
      ["fuera-de-bogota", "fuera-de-cobertura"],
      ["error", "buscando"],
    ] as const;

    for (const [estadoGeo, esperado] of casos) {
      const r = decidirRastreo({ ...EN_SERVICIO, estadoGeo });
      assert.equal(r.rastreando, false, estadoGeo);
      assert.equal(r.rastreando === false && r.motivo, esperado);
    }
  });

  it("todo motivo se puede decir en pantalla", () => {
    // "La degradación se dice": un motivo sin texto sería un mapa quieto y
    // mudo, que es la peor versión de esto.
    for (const texto of Object.values(MENSAJE_SIN_RASTREO)) {
      assert.ok(texto.length > 0);
    }
  });
});

describe("debeEnviar (throttle de 15 s)", () => {
  it("el primer reporte sale de inmediato", () => {
    assert.equal(debeEnviar(null, AHORA), true);
  });

  it("no manda dos veces dentro de la misma ventana", () => {
    assert.equal(debeEnviar(AHORA, AHORA + 1_000), false);
    assert.equal(debeEnviar(AHORA, AHORA + 14_999), false);
  });

  it("manda al cumplirse el intervalo", () => {
    assert.equal(debeEnviar(AHORA, AHORA + INTERVALO_REPORTE_MS), true);
  });

  it("tras una pausa larga manda UNA, no la ráfaga acumulada", () => {
    // El navegador congela temporizadores con la pantalla apagada. Al volver,
    // esto devuelve true una vez; quien llama sella el envío y vuelve a false.
    assert.equal(debeEnviar(AHORA, AHORA + 10 * 60_000), true);
    assert.equal(debeEnviar(AHORA + 10 * 60_000, AHORA + 10 * 60_000 + 500), false);
  });
});

describe("antigüedad y frescura", () => {
  it("mide contra el reloj que se le pase, no contra Date.now()", () => {
    assert.equal(antiguedadS(haceS(30), AHORA), 30);
  });

  it("sin reporte no hay antigüedad, y eso no es cero", () => {
    assert.equal(antiguedadS(null, AHORA), null);
    assert.equal(antiguedadS("no es una fecha", AHORA), null);
    assert.equal(frescuraDe(null), "sin-reporte");
  });

  it("nunca devuelve una antigüedad negativa", () => {
    // Un reloj de consola adelantado no puede producir "hace -3 s".
    assert.equal(antiguedadS(haceS(-120), AHORA), 0);
  });

  it("clasifica viva, rezagada y última conocida", () => {
    assert.equal(frescuraDe(10), "viva");
    assert.equal(frescuraDe(45), "viva");
    assert.equal(frescuraDe(46), "rezagada");
    assert.equal(frescuraDe(300), "rezagada");
    assert.equal(frescuraDe(301), "ultima-conocida");
  });

  it("dice la antigüedad en palabras", () => {
    assert.equal(textoAntiguedad(null), "sin reporte");
    assert.equal(textoAntiguedad(12), "hace 12 s");
    assert.equal(textoAntiguedad(4 * 60), "hace 4 min");
    assert.equal(textoAntiguedad(2 * 3600 + 5 * 60), "hace 2 h 05 min");
  });
});

describe("textoPrecision", () => {
  it("nunca calla la precisión: sin dato lo dice", () => {
    // La trampa de la tarea: el GPS en interiores se equivoca por cientos de
    // metros. Un pin sin radio de error se lee como una certeza.
    assert.equal(textoPrecision(null), "precisión desconocida");
    assert.equal(textoPrecision(undefined), "precisión desconocida");
  });

  it("cambia a kilómetros cuando el error es enorme", () => {
    assert.equal(textoPrecision(18), "±18 m");
    assert.equal(textoPrecision(1500), "±1.5 km");
  });
});

describe("contar", () => {
  it("cuenta tipo, disponibilidad y estado del reporte", () => {
    const c = contar(
      [
        movil({ id: "A", tipo: "TAB", disponible: true, posicion: conPosicion(haceS(5)) }),
        movil({ id: "B", tipo: "TAM", disponible: false, posicion: conPosicion(haceS(900)) }),
        movil({ id: "C", tipo: null }),
      ],
      AHORA,
    );

    assert.equal(c.total, 3);
    assert.equal(c.tab, 1);
    assert.equal(c.tam, 1);
    assert.equal(c.sinTipo, 1);
    assert.equal(c.libres, 2);
    assert.equal(c.ocupados, 1);
    assert.equal(c.sinPosicion, 1);
    assert.equal(c.ultimaConocida, 1);
  });

  it("un tipo sin verificar no se cuenta como TAB ni como TAM", () => {
    // tipoMovil es filtro duro: contarlo mal es peor que no contarlo.
    const c = contar([movil({ id: "A", tipo: null })], AHORA);
    assert.equal(c.tab, 0);
    assert.equal(c.tam, 0);
    assert.equal(c.sinTipo, 1);
  });
});

describe("agruparPorLocalidad", () => {
  const flota = [
    movil({ id: "AMB-1", localidad: "Kennedy", posicion: conPosicion(haceS(5)) }),
    movil({ id: "AMB-2", localidad: "Kennedy", posicion: conPosicion(haceS(5)) }),
    movil({ id: "AMB-3", localidad: "Chapinero", posicion: conPosicion(haceS(5)) }),
    movil({ id: "AMB-4", localidad: null }),
  ];

  it("agrupa y cuenta por zona", () => {
    const g = agruparPorLocalidad(flota, AHORA);
    assert.deepEqual(
      g.map((x) => [x.localidad, x.conteo.total]),
      [["Kennedy", 2], ["Chapinero", 1], [SIN_LOCALIDAD, 1]],
    );
  });

  it("los que no se pueden ubicar van al final, nunca escondidos", () => {
    // Un móvil sin localidad es una carencia de dato que el regulador tiene
    // que ver; desaparecerlo del tablero sería inventar cobertura.
    const soloSinUbicar = agruparPorLocalidad(
      [movil({ id: "X" }), movil({ id: "Y", localidad: "Suba" })],
      AHORA,
    );
    assert.equal(soloSinUbicar.at(-1)?.localidad, SIN_LOCALIDAD);
  });

  it("a igualdad de conteo, orden alfabético — el tablero no baila", () => {
    const g = agruparPorLocalidad(
      [movil({ id: "A", localidad: "Usme" }), movil({ id: "B", localidad: "Bosa" })],
      AHORA,
    );
    assert.deepEqual(g.map((x) => x.localidad), ["Bosa", "Usme"]);
  });

  it("ordena los móviles dentro del grupo por indicativo", () => {
    const g = agruparPorLocalidad(
      [
        movil({ id: "AMB-9", localidad: "Suba" }),
        movil({ id: "AMB-2", localidad: "Suba" }),
      ],
      AHORA,
    );
    assert.deepEqual(g[0].moviles.map((m) => m.id), ["AMB-2", "AMB-9"]);
  });

  it("una flota vacía es una lista vacía, no un error", () => {
    assert.deepEqual(agruparPorLocalidad([], AHORA), []);
  });
});
