/**
 * §7.2 — "el LLM propone, la tabla decide", y cuando la tabla no sabe,
 * el caso escala a criterio humano.
 *
 * Estos tests son la defensa de la regla mas facil de romper del modulo: que
 * alguien, con buena intencion, haga que un diagnostico sin mapeo use lo que
 * propuso el modelo "para no dejar el caso sin servicios".
 */

import { SERVICIOS as S } from '../catalogo/servicios-reps';
import { semillas } from './semillas-catalogos';
import { decidirServicios, normalizarDx, prefijosDe, resolverDx } from './mapa-dx';
import type { VersionEntrada } from './tipos';

const MAPA = semillas().filter((s) => s.coleccion === 'mapa_dx');

describe('normalizar el CIE-10', () => {
  it('el punto es notacion, no dato', () => {
    expect(normalizarDx('I21.1')).toBe('I211');
    expect(normalizarDx('i21.1')).toBe('I211');
    expect(normalizarDx(' I21 ')).toBe('I21');
    expect(normalizarDx(null)).toBe('');
  });

  it('los prefijos van de mas especifico a mas general y paran en la categoria', () => {
    expect(prefijosDe('I211')).toEqual(['I211', 'I21']);
    expect(prefijosDe('I21')).toEqual(['I21']);
  });
});

describe('la tabla decide', () => {
  it('un IAM exige hemodinamia, que es 743 y no 408', () => {
    const r = resolverDx(MAPA, 'I21.1');
    expect(r.estado).toBe('mapeado');
    if (r.estado !== 'mapeado') return;

    expect(r.serviciosRequeridos).toEqual([S.HEMODINAMIA]);
    expect(r.serviciosRequeridos).toContain(743);
    // El README original del proyecto decia 408. 408 es radioterapia.
    expect(r.serviciosRequeridos).not.toContain(408);
    expect(r.requiereMedicoABordo).toBe(true);
    expect(r.protocolo).toBe('CODIGO_INFARTO');
  });

  it('la subcategoria cae en la categoria sin duplicar filas', () => {
    const r = resolverDx(MAPA, 'I21.9');
    expect(r.estado).toBe('mapeado');
    if (r.estado !== 'mapeado') return;
    expect(r.codigo).toBe('I21');
    // `exacto: false` dice que respondio la categoria, no la subcategoria.
    expect(r.exacto).toBe(false);
  });
});

describe('un diagnostico sin mapeo escala a criterio humano', () => {
  it('no se inventa: devuelve sin-mapeo con la accion explicita', () => {
    // E10 (diabetes tipo 1) no esta en la tabla. Es un hueco a proposito.
    const r = resolverDx(MAPA, 'E10.1');
    expect(r.estado).toBe('sin-mapeo');
    if (r.estado !== 'sin-mapeo') return;

    expect(r.motivo).toBe('sin-entrada-en-tabla');
    expect(r.accion).toBe('escala-a-criterio-humano');
    expect(r.mensaje).toMatch(/criterio humano/i);
  });

  it('sin diagnostico tampoco se adivina', () => {
    const r = resolverDx(MAPA, null);
    expect(r.estado).toBe('sin-mapeo');
    if (r.estado !== 'sin-mapeo') return;
    expect(r.motivo).toBe('sin-diagnostico');
  });

  it('un codigo demasiado corto no es un diagnostico', () => {
    // 'I' agruparia el capitulo circulatorio entero.
    const r = resolverDx(MAPA, 'I2');
    expect(r.estado).toBe('sin-mapeo');
    if (r.estado !== 'sin-mapeo') return;
    expect(r.motivo).toBe('diagnostico-incompleto');
  });

  it('una entrada retirada se distingue de una que nunca existio', () => {
    const retirada: VersionEntrada = {
      ...MAPA.find((m) => m.codigo === 'K35')!,
      id: 'k35-v2',
      version: 2,
      activo: false,
      motivo: 'Se reemplaza por una fila por subcategoría',
      creadoEn: '2026-08-01T00:00:00.000Z',
      creadoPor: 'admin@pulso.co',
    };

    const r = resolverDx([...MAPA, retirada], 'K35.0');
    expect(r.estado).toBe('sin-mapeo');
    if (r.estado !== 'sin-mapeo') return;
    // Mismo efecto clinico, distinta conversacion con el admin.
    expect(r.motivo).toBe('entrada-retirada');
    expect(r.accion).toBe('escala-a-criterio-humano');
  });
});

describe('el LLM propone, la tabla decide', () => {
  it('lo que el modelo propuso de mas no se exige, pero se reporta', () => {
    // El modelo propone hemodinamia Y neurocirugia para un IAM.
    const decision = decidirServicios(resolverDx(MAPA, 'I21.1'), [
      S.HEMODINAMIA,
      S.NEUROCIRUGIA,
    ]);

    expect(decision.estado).toBe('tabla-decide');
    if (decision.estado !== 'tabla-decide') return;

    expect(decision.serviciosRequeridos).toEqual([S.HEMODINAMIA]);
    expect(decision.propuestosNoExigidos).toEqual([S.NEUROCIRUGIA]);
  });

  it('lo que el modelo no vio y la tabla si exige, se exige igual', () => {
    const decision = decidirServicios(resolverDx(MAPA, 'I63.0'), []);
    expect(decision.estado).toBe('tabla-decide');
    if (decision.estado !== 'tabla-decide') return;

    expect(decision.serviciosRequeridos).toEqual(
      [S.UCI_ADULTOS, S.IMAGENES_IONIZANTES].sort((a, b) => a - b),
    );
    expect(decision.exigidosNoPropuestos).toHaveLength(2);
  });

  it('sin mapeo, lo que propuso el modelo NO se convierte en exigencia', () => {
    // Este es el test que defiende la regla entera.
    const decision = decidirServicios(resolverDx(MAPA, 'E10.1'), [S.UCI_ADULTOS]);

    expect(decision.estado).toBe('escala-a-criterio-humano');
    if (decision.estado !== 'escala-a-criterio-humano') return;

    // Se conserva para que el regulador lo VEA...
    expect(decision.propuestoPorLlm).toEqual([S.UCI_ADULTOS]);
    // ...y no hay ningun campo por el que salga como exigencia.
    expect(decision).not.toHaveProperty('serviciosRequeridos');
  });
});
