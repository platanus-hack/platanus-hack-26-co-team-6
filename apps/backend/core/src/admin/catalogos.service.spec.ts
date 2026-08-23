/**
 * El servicio de catalogos, contra el almacen en memoria.
 *
 * Prueban lo que un admin ve pasar cuando toca "guardar", no como esta
 * implementado el guardado.
 */

import { AlmacenAdminMemoria } from './almacen-admin';
import { CatalogosService } from './catalogos.service';
import { SERVICIOS as S } from '../catalogo/servicios-reps';

const FIRMANTE = { actor: 'admin@pulso.co', via: 'puente-token-plataforma' };

function servicio() {
  return new CatalogosService(new AlmacenAdminMemoria());
}

describe('editar una etiqueta no rompe el historico', () => {
  it('el codigo sigue igual y sale una version nueva', async () => {
    const svc = servicio();

    const antes = await svc.historial('motivo_rechazo', 'SIN_CAMA_UCI');
    expect(antes.vigente.version).toBe(1);
    expect(antes.vigente.etiqueta).toBe('Sin camas UCI disponibles');

    const r = await svc.nuevaVersion(
      'motivo_rechazo',
      'SIN_CAMA_UCI',
      {
        etiqueta: 'Sin disponibilidad de camas de cuidado intensivo',
        datos: { categoria: 'capacidad', requiereDetalle: false },
        motivo: 'Vocabulario del comité clínico de agosto',
      },
      FIRMANTE,
    );

    expect(r.creada).toBe(true);
    expect(r.entrada.codigo).toBe('SIN_CAMA_UCI');
    expect(r.entrada.version).toBe(2);

    const despues = await svc.historial('motivo_rechazo', 'SIN_CAMA_UCI');
    expect(despues.versiones).toHaveLength(2);
    // ⭐ La v1 conserva la etiqueta con la que se tomaron las decisiones viejas.
    expect(despues.versiones[0].etiqueta).toBe('Sin camas UCI disponibles');
    expect(despues.versiones[0].codigo).toBe('SIN_CAMA_UCI');
    expect(despues.cambios[1]).toEqual([
      {
        campo: 'etiqueta',
        antes: 'Sin camas UCI disponibles',
        despues: 'Sin disponibilidad de camas de cuidado intensivo',
      },
    ]);
  });

  it('renombrar el codigo es un 400, no un cambio silencioso', async () => {
    const svc = servicio();
    await expect(
      svc.nuevaVersion(
        'motivo_rechazo',
        'SIN_CAMA_UCI',
        {
          codigo: 'UCI_LLENA',
          etiqueta: 'Sin camas UCI disponibles',
          datos: { categoria: 'capacidad', requiereDetalle: false },
          motivo: 'x',
        },
        FIRMANTE,
      ),
    ).rejects.toThrow(/inmutable/i);
  });

  it('el mismo guardado dos veces deja una sola version', async () => {
    const svc = servicio();
    const cambio = {
      etiqueta: 'Urgencias sin capacidad',
      datos: { categoria: 'capacidad', requiereDetalle: false },
      motivo: 'Redacción',
    };

    const uno = await svc.nuevaVersion('motivo_rechazo', 'URGENCIAS_SATURADA', cambio, FIRMANTE);
    const dos = await svc.nuevaVersion('motivo_rechazo', 'URGENCIAS_SATURADA', cambio, FIRMANTE);

    expect(uno.creada).toBe(true);
    expect(dos.creada).toBe(false);
    expect((await svc.historial('motivo_rechazo', 'URGENCIAS_SATURADA')).versiones).toHaveLength(2);
  });

  it('una version nueva sin motivo no pasa', async () => {
    const svc = servicio();
    await expect(
      svc.nuevaVersion(
        'motivo_rechazo',
        'SIN_CAMA_UCI',
        { etiqueta: 'Otra cosa', datos: { categoria: 'capacidad', requiereDetalle: false } },
        FIRMANTE,
      ),
    ).rejects.toThrow(/motivo/i);
  });
});

describe('todo cambio deja evento', () => {
  it('crear, versionar y retirar quedan en la auditoria con actor', async () => {
    const svc = servicio();

    await svc.crear(
      'motivo_rechazo',
      {
        codigo: 'SIN_SANGRE',
        etiqueta: 'Banco de sangre sin unidades compatibles',
        datos: { categoria: 'infraestructura', requiereDetalle: true },
      },
      FIRMANTE,
    );

    await svc.nuevaVersion(
      'motivo_rechazo',
      'SIN_SANGRE',
      {
        etiqueta: 'Sin hemocomponentes compatibles',
        datos: { categoria: 'infraestructura', requiereDetalle: true },
        motivo: 'Término del banco de sangre',
      },
      FIRMANTE,
    );

    await svc.nuevaVersion(
      'motivo_rechazo',
      'SIN_SANGRE',
      {
        etiqueta: 'Sin hemocomponentes compatibles',
        datos: { categoria: 'infraestructura', requiereDetalle: true },
        activo: false,
        motivo: 'Se cubre con SIN_ESPECIALISTA',
      },
      FIRMANTE,
    );

    const eventos = await svc.eventos({ codigo: 'SIN_SANGRE' });
    expect(eventos.map((e) => e.accion)).toEqual([
      'entrada.retirada',
      'version.creada',
      'entrada.creada',
    ]);
    expect(eventos.every((e) => e.actor === 'admin@pulso.co')).toBe(true);
    expect(eventos.every((e) => e.via === 'puente-token-plataforma')).toBe(true);
  });

  it('retirar no borra: la entrada sigue en el historial', async () => {
    const svc = servicio();
    await svc.nuevaVersion(
      'motivo_rechazo',
      'SIN_ESPECIALISTA',
      {
        etiqueta: 'Sin especialista de turno',
        datos: { categoria: 'talento_humano', requiereDetalle: true },
        activo: false,
        motivo: 'Prueba',
      },
      FIRMANTE,
    );

    const activos = await svc.activos('motivo_rechazo');
    expect(activos.map((a) => a.codigo)).not.toContain('SIN_ESPECIALISTA');

    const historial = await svc.historial('motivo_rechazo', 'SIN_ESPECIALISTA');
    expect(historial.versiones).toHaveLength(2);
    expect(historial.versiones[0].activo).toBe(true);
  });
});

describe('no se inventan codigos REPS', () => {
  it('un codigo fuera del CodeSystem es 400', async () => {
    const svc = servicio();
    await expect(
      svc.crear(
        'mapa_dx',
        {
          codigo: 'A41',
          etiqueta: 'Sepsis',
          // 999 no existe en catalogo/servicios-reps.ts.
          datos: { serviciosRequeridos: [999], complejidadMinima: 'alta' },
        },
        FIRMANTE,
      ),
    ).rejects.toThrow(/REPS/i);
  });

  it('acepta los del CodeSystem compilado', async () => {
    const svc = servicio();
    const entrada = await svc.crear(
      'mapa_dx',
      {
        codigo: 'A41',
        etiqueta: 'Sepsis',
        datos: {
          serviciosRequeridos: [S.UCI_ADULTOS],
          complejidadMinima: 'alta',
          requiereMedicoABordo: true,
        },
      },
      FIRMANTE,
    );
    expect(entrada.version).toBe(1);

    const r = await svc.resolver('A41.9');
    expect(r.estado).toBe('mapeado');
  });

  it('el selector de la consola solo ofrece codigos oficiales', () => {
    const codigos = servicio()
      .serviciosReps()
      .map((s) => s.codigo);
    expect(codigos).toContain(743); // hemodinamia
    expect(codigos).toContain(1102); // urgencias
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('una fila del mapa no puede apuntar a un protocolo fantasma', async () => {
    const svc = servicio();
    await expect(
      svc.crear(
        'mapa_dx',
        {
          codigo: 'A41',
          etiqueta: 'Sepsis',
          datos: {
            serviciosRequeridos: [S.UCI_ADULTOS],
            complejidadMinima: 'alta',
            protocolo: 'CODIGO_QUE_NO_EXISTE',
          },
        },
        FIRMANTE,
      ),
    ).rejects.toThrow(/protocolo/i);
  });
});

describe('un diagnostico sin mapeo escala a criterio humano', () => {
  it('la decision no adopta lo que propuso el LLM', async () => {
    const decision = await servicio().decidir('E10.1', [S.UCI_ADULTOS]);
    expect(decision.estado).toBe('escala-a-criterio-humano');
  });

  it('y con mapeo, la tabla manda', async () => {
    const decision = await servicio().decidir('I21.0', [S.CIRUGIA_GENERAL]);
    expect(decision.estado).toBe('tabla-decide');
    if (decision.estado !== 'tabla-decide') return;
    expect(decision.serviciosRequeridos).toEqual([S.HEMODINAMIA]);
    expect(decision.propuestosNoExigidos).toEqual([S.CIRUGIA_GENERAL]);
  });
});

describe('crear entradas', () => {
  it('rechaza un codigo que no se puede corregir despues', async () => {
    await expect(
      servicio().crear(
        'motivo_rechazo',
        { codigo: 'sin cama', etiqueta: 'x', datos: { categoria: 'otro' } },
        FIRMANTE,
      ),
    ).rejects.toThrow(/inmutable|inválido/i);
  });

  it('un codigo que ya existe manda a crear version, no a sobrescribir', async () => {
    await expect(
      servicio().crear(
        'motivo_rechazo',
        {
          codigo: 'SIN_CAMA_UCI',
          etiqueta: 'Otra cosa',
          datos: { categoria: 'capacidad' },
        },
        FIRMANTE,
      ),
    ).rejects.toThrow(/ya existe/i);
  });
});

describe('degrada y lo dice', () => {
  it('reporta que la persistencia es memoria', () => {
    expect(servicio().estadoPersistencia()).toBe('memoria');
  });
});
