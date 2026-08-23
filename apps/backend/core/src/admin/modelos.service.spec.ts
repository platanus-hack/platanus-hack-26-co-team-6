/**
 * "¿Con que version de prompt se proceso un caso de hace una semana?"
 *
 * Es la pregunta que la tarea pide poder responder, y el unico test que la
 * responde de verdad es uno que ANOTA con fecha vieja, cambia el modelo varias
 * veces y despues pregunta.
 */

import { AlmacenAdminMemoria } from './almacen-admin';
import { CatalogosService } from './catalogos.service';
import { ModelosService } from './modelos.service';

const FIRMANTE = { actor: 'admin@pulso.co', via: 'puente-token-plataforma' };

function montar() {
  const almacen = new AlmacenAdminMemoria();
  return {
    modelos: new ModelosService(almacen),
    catalogos: new CatalogosService(almacen),
  };
}

/** Una semana antes de "hoy", con fecha fija para que el test no dependa del reloj. */
const HACE_UNA_SEMANA = '2026-08-15T03:12:00.000Z';

describe('que version proceso un caso de hace una semana', () => {
  it('devuelve la version tal como estaba escrita ese dia', async () => {
    const { modelos, catalogos } = montar();
    const casoId = 'caso-de-hace-una-semana';

    // Hace una semana el caso se proceso con el prompt v1.
    await modelos.registrarProcesamiento(
      {
        casoId,
        coleccion: 'prompt_clinico',
        codigo: 'TRIAGE_EXTRACCION',
        procesadoEn: HACE_UNA_SEMANA,
      },
      FIRMANTE,
    );

    // Desde entonces el prompt cambio dos veces.
    await catalogos.nuevaVersion(
      'prompt_clinico',
      'TRIAGE_EXTRACCION',
      {
        etiqueta: 'Extracción clínica del dictado',
        datos: {
          referencia: 'apps/backend/ai-core',
          huella: 'sha256:aaaa',
          notas: 'Se unifica el prompt (tarea 0.5)',
        },
        motivo: 'Un solo prompt clínico',
      },
      FIRMANTE,
    );
    await catalogos.nuevaVersion(
      'prompt_clinico',
      'TRIAGE_EXTRACCION',
      {
        etiqueta: 'Extracción clínica del dictado',
        datos: {
          referencia: 'apps/backend/ai-core',
          huella: 'sha256:bbbb',
          notas: 'Se agregan signos de alarma pediátricos',
        },
        motivo: 'Cobertura pediátrica',
      },
      FIRMANTE,
    );

    const procesamientos = await modelos.porCaso(casoId);
    expect(procesamientos).toHaveLength(1);

    const [p] = procesamientos;
    expect(p.registro.version).toBe(1);
    expect(p.registro.procesadoEn).toBe(HACE_UNA_SEMANA);
    // ⭐ La version que se le devuelve al auditor es la de ese dia...
    expect(p.version?.datos).toMatchObject({ huella: null });
    // ...y se le dice cuantas han salido despues, que es lo que convierte el
    // dato en informacion: ese caso no es comparable con los de esta semana.
    expect(p.versionesPosteriores).toBe(2);
  });

  it('anotar el mismo hecho dos veces no lo duplica', async () => {
    const { modelos } = montar();
    const peticion = {
      casoId: 'caso-1',
      coleccion: 'config_scoring' as const,
      codigo: 'RUTEO',
      version: 1,
      procesadoEn: HACE_UNA_SEMANA,
    };

    const uno = await modelos.registrarProcesamiento(peticion, FIRMANTE);
    const dos = await modelos.registrarProcesamiento(peticion, FIRMANTE);

    expect(uno.nuevo).toBe(true);
    expect(dos.nuevo).toBe(false);
    expect(dos.registro.id).toBe(uno.registro.id);
    expect(await modelos.porCaso('caso-1')).toHaveLength(1);
  });

  it('no se anota contra una version que nunca existio', async () => {
    const { modelos } = montar();
    await expect(
      modelos.registrarProcesamiento(
        { casoId: 'caso-1', coleccion: 'prompt_clinico', codigo: 'TRIAGE_EXTRACCION', version: 9 },
        FIRMANTE,
      ),
    ).rejects.toThrow(/versión 9/i);
  });

  it('una fecha corrupta se rechaza en vez de convertirse en Invalid Date', async () => {
    const { modelos } = montar();
    await expect(
      modelos.registrarProcesamiento(
        {
          casoId: 'caso-1',
          coleccion: 'prompt_clinico',
          codigo: 'TRIAGE_EXTRACCION',
          procesadoEn: 'ayer por la tarde',
        },
        FIRMANTE,
      ),
    ).rejects.toThrow(/ISO/i);
  });

  it('un caso sin registro lo dice, no devuelve una lista vacia y ya', async () => {
    const { modelos } = montar();
    expect(await modelos.porCaso('caso-que-no-existe')).toEqual([]);
  });
});

describe('que casos proceso una version', () => {
  it('la vuelta del registro', async () => {
    const { modelos } = montar();
    for (const casoId of ['caso-a', 'caso-b']) {
      await modelos.registrarProcesamiento(
        { casoId, coleccion: 'config_scoring', codigo: 'RUTEO', version: 1 },
        FIRMANTE,
      );
    }

    const casos = await modelos.casosDe('config_scoring', 'RUTEO', 1);
    expect(casos.map((c) => c.casoId).sort()).toEqual(['caso-a', 'caso-b']);
  });
});

describe('versionar un modelo usa la misma maquina que los catalogos', () => {
  it('cambiar los parametros de scoring crea version, no los pisa', async () => {
    const { modelos, catalogos } = montar();

    const r = await catalogos.nuevaVersion(
      'config_scoring',
      'RUTEO',
      {
        etiqueta: 'Configuración de ruteo — costo en minutos',
        datos: {
          parametros: {
            ESPERA_RESPUESTA_PRIOR: 4,
            SOBRECOSTO_REBOTE: 18,
            PENALIZACION_REBOTE: 22,
            ESPERA_PUERTA_MAX: 30,
            BONO_CAPACIDAD_MAX: 5,
            FUERZA_PRIOR: 10,
            FUERZA_PRIOR_LATENCIA: 3,
          },
          notas: 'Espera en puerta medida en tres IPS de Bogotá',
        },
        motivo: 'Calibración con datos de agosto',
      },
      FIRMANTE,
    );

    expect(r.creada).toBe(true);
    expect(r.entrada.version).toBe(2);

    const comparacion = await modelos.comparar('config_scoring', 'RUTEO', 1, 2);
    expect(comparacion.cambios.map((c) => c.campo)).toContain('datos.parametros');
    // La v1 sigue diciendo 25, que es con lo que corrieron los casos viejos.
    expect(
      (comparacion.a.datos.parametros as Record<string, number>).ESPERA_PUERTA_MAX,
    ).toBe(25);
  });

  it('comparar contra una version que no existe es 404', async () => {
    const { modelos } = montar();
    await expect(modelos.comparar('config_scoring', 'RUTEO', 1, 7)).rejects.toThrow(
      /RUTEO@7/,
    );
  });
});
