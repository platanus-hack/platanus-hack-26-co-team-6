/**
 * La maquina de versionado. Se prueba COMPORTAMIENTO: que le pasa al historico
 * cuando alguien edita una etiqueta, no como esta escrita la funcion.
 */

import {
  codigoValido,
  compararVersiones,
  historialDe,
  normalizarCodigo,
  primeraVersion,
  proponerVersion,
  siguienteVersion,
  vigente,
  vigentesActivos,
  vigentesPorCodigo,
} from './versionado';
import type { VersionEntrada } from './tipos';

const CTX = { id: 'fila-2', actor: 'admin@pulso.co', ahora: '2026-08-22T10:00:00.000Z' };

function fila(over: Partial<VersionEntrada> = {}): VersionEntrada {
  return {
    id: 'fila-1',
    coleccion: 'motivo_rechazo',
    codigo: 'SIN_CAMA_UCI',
    version: 1,
    etiqueta: 'Sin camas UCI disponibles',
    datos: { categoria: 'capacidad', requiereDetalle: false },
    activo: true,
    motivo: null,
    creadoEn: '2026-01-01T00:00:00.000Z',
    creadoPor: 'sistema',
    ...over,
  };
}

describe('el codigo es inmutable', () => {
  it('proponerVersion toma el codigo del historial, no del borrador', () => {
    // No hay parametro por donde colar un codigo nuevo: es la garantia
    // estructural, no una validacion que alguien pueda olvidar.
    const propuesta = proponerVersion(
      [fila()],
      {
        etiqueta: 'Sin disponibilidad de camas UCI',
        datos: { categoria: 'capacidad', requiereDetalle: false },
        activo: true,
        motivo: 'Redacción del comité clínico de agosto',
      },
      CTX,
    );

    expect(propuesta.estado).toBe('nueva-version');
    if (propuesta.estado !== 'nueva-version') return;
    expect(propuesta.entrada.codigo).toBe('SIN_CAMA_UCI');
  });

  it('rechaza codigos con espacios, tildes o minusculas', () => {
    expect(codigoValido('SIN_CAMA_UCI')).toBe(true);
    expect(codigoValido('I21')).toBe(true);
    expect(codigoValido('sin_cama')).toBe(false);
    expect(codigoValido('SIN CAMA')).toBe(false);
    expect(codigoValido('CÓDIGO')).toBe(false);
    expect(codigoValido('A')).toBe(false);
  });

  it('normaliza a mayusculas sin arreglar lo que esta mal', () => {
    expect(normalizarCodigo('  i21 ')).toBe('I21');
    // Normalizado sigue siendo invalido: quien llame debe rechazarlo.
    expect(codigoValido(normalizarCodigo('sin cama'))).toBe(false);
  });
});

describe('editar una etiqueta no rompe el historico', () => {
  const v1 = fila();

  it('crea una version nueva en vez de modificar la que hay', () => {
    const propuesta = proponerVersion(
      [v1],
      {
        etiqueta: 'Sin disponibilidad de camas de cuidado intensivo',
        datos: v1.datos,
        activo: true,
        motivo: 'Alineación con el vocabulario de la Resolución 3100',
      },
      CTX,
    );

    expect(propuesta.estado).toBe('nueva-version');
    if (propuesta.estado !== 'nueva-version') return;

    const v2 = propuesta.entrada;
    expect(v2.version).toBe(2);
    expect(v2.codigo).toBe(v1.codigo);
    expect(propuesta.cambios).toEqual([
      {
        campo: 'etiqueta',
        antes: 'Sin camas UCI disponibles',
        despues: 'Sin disponibilidad de camas de cuidado intensivo',
      },
    ]);

    // Lo que importa: la v1 sigue intacta y sigue diciendo lo que decia el dia
    // que un jefe de urgencias la leyo y toco el boton.
    expect(v1.etiqueta).toBe('Sin camas UCI disponibles');
    const historial = historialDe([v1, v2], 'SIN_CAMA_UCI');
    expect(historial.map((f) => f.version)).toEqual([1, 2]);
    expect(historial[0].etiqueta).toBe('Sin camas UCI disponibles');
  });

  it('la vigente es la de numero mas alto', () => {
    const v2 = fila({ id: 'fila-2', version: 2, etiqueta: 'Otra' });
    expect(vigente([v1, v2])?.version).toBe(2);
    // Y no depende del orden en que lleguen las filas.
    expect(vigente([v2, v1])?.version).toBe(2);
  });
});

describe('sin cambio no hay version', () => {
  it('un borrador identico devuelve sin-cambios', () => {
    const propuesta = proponerVersion(
      [fila()],
      {
        etiqueta: 'Sin camas UCI disponibles',
        datos: { categoria: 'capacidad', requiereDetalle: false },
        activo: true,
        motivo: 'da igual',
      },
      CTX,
    );
    expect(propuesta.estado).toBe('sin-cambios');
  });

  it('reordenar las claves de datos no cuenta como cambio', () => {
    // El navegador puede serializar en otro orden. Una version fantasma
    // ensucia el historico justo donde se va a buscar el cambio real.
    const propuesta = proponerVersion(
      [fila()],
      {
        etiqueta: 'Sin camas UCI disponibles',
        datos: { requiereDetalle: false, categoria: 'capacidad' },
        activo: true,
        motivo: 'da igual',
      },
      CTX,
    );
    expect(propuesta.estado).toBe('sin-cambios');
  });
});

describe('el motivo es obligatorio de la v2 en adelante', () => {
  it('sin motivo no se crea la version', () => {
    const propuesta = proponerVersion(
      [fila()],
      { etiqueta: 'Otra cosa', datos: fila().datos, activo: true, motivo: '   ' },
      CTX,
    );
    expect(propuesta.estado).toBe('falta-motivo');
  });

  it('la v1 si puede no tenerlo: no hay nada que explicar todavia', () => {
    const v1 = primeraVersion(
      'protocolo',
      'CODIGO_SEPSIS',
      { etiqueta: 'Código sepsis', datos: { pasos: ['x'], ventanaMin: 60, referencia: null }, motivo: null },
      CTX,
    );
    expect(v1.version).toBe(1);
    expect(v1.motivo).toBeNull();
  });
});

describe('retirar no borra', () => {
  it('es una version con activo:false y queda en el historial', () => {
    const propuesta = proponerVersion(
      [fila()],
      { etiqueta: fila().etiqueta, datos: fila().datos, activo: false, motivo: 'Ya no se usa' },
      CTX,
    );
    expect(propuesta.estado).toBe('nueva-version');
    if (propuesta.estado !== 'nueva-version') return;

    expect(propuesta.entrada.activo).toBe(false);
    expect(propuesta.cambios).toEqual([{ campo: 'activo', antes: true, despues: false }]);

    const filas = [fila(), propuesta.entrada];
    expect(vigentesPorCodigo(filas)).toHaveLength(1);
    expect(vigentesActivos(filas)).toHaveLength(0);
    // Y el historial completo sigue teniendo las dos.
    expect(historialDe(filas, 'SIN_CAMA_UCI')).toHaveLength(2);
  });
});

describe('comparar versiones', () => {
  it('desglosa datos campo por campo, no como bloque', () => {
    const cambios = compararVersiones(
      { etiqueta: 'IAM', activo: true, datos: { serviciosRequeridos: [743], complejidadMinima: 'alta' } },
      { etiqueta: 'IAM', activo: true, datos: { serviciosRequeridos: [743, 110], complejidadMinima: 'alta' } },
    );
    expect(cambios).toEqual([
      { campo: 'datos.serviciosRequeridos', antes: [743], despues: [743, 110] },
    ]);
  });
});

describe('siguienteVersion', () => {
  it('empieza en 1 para un codigo que no existe', () => {
    expect(siguienteVersion([], 'NUEVO')).toBe(1);
  });

  it('sigue desde la vigente', () => {
    expect(siguienteVersion([fila(), fila({ version: 2 })], 'SIN_CAMA_UCI')).toBe(3);
  });
});
