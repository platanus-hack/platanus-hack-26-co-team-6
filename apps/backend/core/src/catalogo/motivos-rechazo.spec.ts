/**
 * Tarea 0.6 — el catalogo es un contrato con el futuro.
 *
 * Estos tests prueban COMPORTAMIENTO, no la forma de la lista: que un codigo
 * sobreviva a que le cambien la etiqueta, que la categoria administrativa se
 * pueda reportar aparte, y que un texto viejo no se pierda.
 */

import {
  MOTIVOS_RECHAZO,
  MOTIVO_POR_DEFECTO,
  categoriaDeMotivo,
  codigoDesdeEtiqueta,
  etiquetaDeMotivo,
  motivoPorCodigo,
} from './motivos-rechazo';

describe('catalogo de motivos de rechazo', () => {
  it('no repite codigos: agrupar por codigo tiene que ser inequivoco', () => {
    const codigos = MOTIVOS_RECHAZO.map((m) => m.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('ofrece el motivo administrativo que faltaba, y se puede reportar aparte', () => {
    // La distincion que sostiene la tesis: sin camas es la red saturada,
    // sin claridad del pagador es friccion. Contarlos juntos las esconde.
    expect(categoriaDeMotivo('SIN_CLARIDAD_PAGADOR')).toBe('administrativo');

    const administrativos = MOTIVOS_RECHAZO.filter(
      (m) => m.categoria === 'administrativo',
    );
    expect(administrativos.map((m) => m.codigo)).toContain(
      'SIN_CLARIDAD_PAGADOR',
    );

    // Y no todos son administrativos: la categoria separa de verdad.
    expect(
      MOTIVOS_RECHAZO.some((m) => m.categoria === 'capacidad'),
    ).toBe(true);
  });

  it('un codigo desconocido no revienta: se pinta el propio codigo', () => {
    // Un cliente adelantado a un deploy viejo de core manda un codigo que
    // este core no conoce. Preferimos pintar el codigo crudo antes que
    // tumbar la pantalla de quien tiene 45 segundos para responder.
    expect(etiquetaDeMotivo('MOTIVO_QUE_NO_EXISTE')).toBe('MOTIVO_QUE_NO_EXISTE');
    expect(motivoPorCodigo('MOTIVO_QUE_NO_EXISTE')).toBeUndefined();
  });

  it('sin motivo no hay etiqueta', () => {
    expect(etiquetaDeMotivo(null)).toBeNull();
    expect(etiquetaDeMotivo(undefined)).toBeNull();
    expect(codigoDesdeEtiqueta('')).toBeNull();
  });

  it('recupera el codigo de una etiqueta vieja, sin importar mayusculas ni espacios', () => {
    expect(codigoDesdeEtiqueta('Sin camas UCI disponibles')).toBe('SIN_CAMAS_UCI');
    expect(codigoDesdeEtiqueta('  sin especialista de turno ')).toBe(
      'SIN_ESPECIALISTA',
    );
  });

  it('NO inventa un codigo para un texto que no cruza', () => {
    // Un codigo falso ensucia el dataset mas que un hueco declarado: el hueco
    // se ve al agregar, el codigo falso se cuenta como si fuera cierto.
    expect(codigoDesdeEtiqueta('me lo invente ahora mismo')).toBeNull();
  });

  it('el motivo por defecto existe en el catalogo', () => {
    // Lo usa el webhook de Telegram, que solo tiene dos botones.
    expect(motivoPorCodigo(MOTIVO_POR_DEFECTO)).toBeDefined();
  });
});
