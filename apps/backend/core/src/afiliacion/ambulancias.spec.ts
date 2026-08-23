/**
 * Autoverificación de operadores de ambulancia — tarea 2.9.
 *
 * Se prueba contra el catálogo REAL (las 225 filas compiladas), no contra
 * fixtures: el punto de la tarea es que el archivo que ya estaba en
 * `data/procesado/ambulancias.json` y no consumía nadie sirva para afiliar sin
 * trámite. Un fixture probaría el código y no el dato.
 */

import {
  AMBULANCIAS_CATALOGO,
  totalOperadores,
  verificarOperador,
} from './ambulancias';

describe('catálogo compilado', () => {
  it('trae las 225 filas del corte 01/07/2026 con sus marcas', () => {
    expect(totalOperadores()).toEqual({ total: 225, tab: 112, tam: 53 });
  });

  it('ninguna fila trae NIT: la fuente no lo publica', () => {
    // No es un bug del catálogo, es la razón por la que el cruce cae siempre
    // por nombre. Si algún día deja de ser cierto, este test avisa.
    expect(AMBULANCIAS_CATALOGO.every((f) => f.nit === null)).toBe(true);
  });
});

describe('un prestador real se autoverifica', () => {
  it('cruza pese a tildes, minúsculas y puntuación distintas', () => {
    const resultado = verificarOperador({
      nit: '9001234568',
      razonSocial: 'Ambulancias Aéreas de Colombia S.A.S.',
    });

    expect(resultado.encontrada).toBe(true);
    expect(resultado.requiereRevision).toBe(false);
    expect(resultado.coincidencia).toBeGreaterThan(0.85);
    expect(resultado.precargaOperador?.prestador).toBe(
      'AMBULANCIAS AEREAS DE COLOMBIA S.A.S.',
    );
  });

  it('la marca TAB/TAM llega precargada, y con ella dirección y contacto', () => {
    const resultado = verificarOperador({
      nit: '9001234568',
      razonSocial: 'AMBULANCIAS PRIMEROS AUXILIOS LTDA',
    });

    const precarga = resultado.precargaOperador;
    expect(precarga).toBeDefined();
    // Es la marca que después alimenta `movil.tipo` en el alta de flota.
    expect(precarga?.tipos).toEqual(['TAB', 'TAM']);
    expect(precarga?.requiereDeclararFlota).toBe(false);
    expect(precarga?.direccion).toBeTruthy();
    expect(precarga?.telefono).toBe('2770977');
    expect(precarga?.correo).toBe('operaciones@apa.net.co');
  });

  it('un operador solo medicalizado llega marcado solo TAM', () => {
    const resultado = verificarOperador({
      nit: '9001234568',
      razonSocial: 'Aeromas SAS',
    });
    expect(resultado.precargaOperador?.tipos).toEqual(['TAM']);
  });

  it('cruza por el nombre de la sede cuando difiere del prestador', () => {
    // "ADMINISTRADORA COUNTRY S.A.S" opera la "CLINICA DEL COUNTRY IPS": el
    // afiliado va a escribir el nombre por el que lo conocen.
    const resultado = verificarOperador({
      nit: '9001234568',
      razonSocial: 'Clínica del Country IPS',
    });
    expect(resultado.encontrada).toBe(true);
    expect(resultado.precargaOperador?.sede).toBe('CLINICA DEL COUNTRY IPS');
  });
});

describe('cuando el registro no basta, se dice qué falta', () => {
  it('sin cruce queda para revisión, nunca rechazado, y enumera qué mandar', () => {
    const resultado = verificarOperador({
      nit: '9001234568',
      razonSocial: 'Ambulancias Inventadas del Zipa 2099',
    });

    expect(resultado.encontrada).toBe(false);
    // "No cruza" NO es rechazo: el registro es un corte con fecha.
    expect(resultado.requiereRevision).toBe(true);
    expect(resultado.motivo).toBe('operador_fuera_del_registro_de_transporte');
    expect(resultado.mensaje).toContain('225');
    expect(resultado.falta).toEqual(
      expect.arrayContaining([
        expect.stringContaining('NIT'),
        expect.stringContaining('código de habilitación'),
        expect.stringContaining('razón social'),
      ]),
    );
  });

  it('con un tipeo cercano sugiere el nombre correcto', () => {
    const resultado = verificarOperador({
      nit: '9001234568',
      razonSocial: 'Ambulancias Primeros Auxilio',
    });
    expect(
      resultado.sugerencia ?? resultado.precargaOperador?.prestador,
    ).toContain('AMBULANCIAS PRIMEROS AUXILIOS');
  });

  it('sin razón social lo dice, en vez de contestar "no encontrada"', () => {
    const resultado = verificarOperador({ nit: '9001234568' });
    expect(resultado.motivo).toBe('sin_razon_social_para_contrastar');
    expect(resultado.falta).toContain('razón social del operador');
  });

  it('un prestador sin marca TAB ni TAM cruza pero avisa que falta la flota', () => {
    // 101 de las 225 filas son IPS que aparecen por su servicio de urgencias.
    const resultado = verificarOperador({
      nit: '9001234568',
      razonSocial: 'ADMINISTRADORA CLINICA LA COLINA SAS',
    });

    expect(resultado.encontrada).toBe(true);
    expect(resultado.requiereRevision).toBe(true);
    expect(resultado.motivo).toBe('operador_sin_marca_tab_ni_tam');
    expect(resultado.precargaOperador?.tipos).toEqual([]);
    expect(resultado.precargaOperador?.requiereDeclararFlota).toBe(true);
    expect(resultado.falta.join(' ')).toContain('TAB');
  });
});

describe('el cruce por NIT gana cuando el catálogo lo tiene', () => {
  it('cruza por NIT aunque el nombre esté escrito distinto', () => {
    // El catálogo real no trae NIT; se inyecta uno para probar el camino que
    // se activará el día que la Secretaría publique la columna.
    const catalogo = [
      {
        prestador: 'TRANSPORTE ASISTENCIAL DEL SUR SAS',
        sede: 'TRANSPORTE ASISTENCIAL DEL SUR SAS',
        direccion: 'CALLE 1 2 3',
        telefono: '3001112233',
        correo: 'contacto@tas.com.co',
        nit: '900.123.456-8',
        tab: true,
        tam: false,
        urgencias: false,
      },
    ];

    const resultado = verificarOperador(
      { nit: '9001234568', razonSocial: 'otra cosa completamente distinta' },
      catalogo,
    );

    expect(resultado.encontrada).toBe(true);
    expect(resultado.coincidencia).toBe(1);
    expect(resultado.mensaje).toContain('por NIT');
    expect(resultado.precargaOperador?.tipos).toEqual(['TAB']);
  });
});
