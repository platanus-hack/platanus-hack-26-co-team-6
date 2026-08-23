/**
 * El expediente forense — tarea 4.12.
 *
 * Lo que se prueba es lo que hace defendible al sistema:
 *   · un caso se reconstruye sin huecos silenciosos (y los que hay, se dicen)
 *   · las correcciones se ven como correcciones
 *   · un `admin_organizacion` NO ve casos ajenos, verificado en el servidor
 *   · la lectura del auditor queda registrada
 *   · el dictado crudo y el origen del paciente no salen ni por accidente
 */

import { ForbiddenException } from '@nestjs/common';
import type { RoutingDecisionEvidence } from '../contracts/types';
import type { ActorSolicitante } from '../eventos/actor.service';
import { MemoriaAlmacenEventos } from '../eventos/almacen-eventos';
import { RegistroService } from '../eventos/registro.service';
import type {
  RoutingStore,
  StoredRoutingDecision,
} from '../persistence/routing-store';
import { AuditoriaService } from './auditoria.service';
import { MARCA } from './redaccion';

const CASO = 'caso-1';

/** El `inputs` de la evidencia es el Caso ENTERO: trae dictado y origen. */
const EVIDENCIA: RoutingDecisionEvidence = {
  caseId: CASO,
  modelVersion: 'routing-v1',
  configVersion: 'routing-config-v1',
  inputs: {
    id: CASO,
    textoCrudo: 'masculino de 54 años, dolor torácico, carrera 30 con 45',
    origen: { lat: 4.6, lng: -74.08 },
    resumen: 'IAM con elevación del ST',
    dxCie10: 'I21.1',
    triage: 2,
  },
  candidates: [
    { sede: { codigo: 'S-1', nombre: 'San Carlos' }, rank: 1, motivoDescarte: null },
    {
      sede: { codigo: 'S-2', nombre: 'Clínica Norte' },
      rank: 0,
      motivoDescarte: 'No tiene Hemodinamia e intervencionismo',
    },
  ],
  selectedDestination: 'S-1',
  etaProvenance: 'haversine_fallback',
  minuteBreakdown: { ruta: 12, riesgoRechazo: 3, espera: 4, bono: -2 },
  fingerprint: 'abc123',
};

class StoreFalso implements RoutingStore {
  constructor(private readonly guardada?: StoredRoutingDecision) {}
  respond = jest.fn();
  saveDecision = jest.fn();
  async decision(): Promise<StoredRoutingDecision | undefined> {
    return this.guardada;
  }
  audit(): readonly RoutingDecisionEvidence[] {
    return [];
  }
}

function actor(over: Partial<ActorSolicitante> = {}): ActorSolicitante {
  return {
    id: 'turno:operador',
    nombre: null,
    tipo: 'humano',
    organizacionId: null,
    roles: ['auditor'],
    provisional: true,
    ...over,
  };
}

function montar(decision?: StoredRoutingDecision) {
  const registro = new RegistroService(new MemoriaAlmacenEventos());
  const auditoria = new AuditoriaService(registro, new StoreFalso(decision));
  return { registro, auditoria };
}

describe('AuditoriaService · quién puede abrir un expediente', () => {
  it('sin roles no se abre, y el 403 dice qué falta', async () => {
    const { auditoria } = montar();
    const intento = auditoria.expediente(CASO, actor({ roles: [] }));
    await expect(intento).rejects.toBeInstanceOf(ForbiddenException);
    await expect(intento).rejects.toThrow(/PULSO_ROLES_TURNO/);
  });

  it('un paramédico no abre expedientes', async () => {
    const { auditoria } = montar();
    await expect(
      auditoria.expediente(CASO, actor({ roles: ['paramedico'] })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('el auditor y el regulador del CRUE sí', async () => {
    const { auditoria } = montar();
    for (const rol of ['auditor', 'regulador_crue'] as const) {
      const expediente = await auditoria.expediente(CASO, actor({ roles: [rol] }));
      expect(expediente.solicitante.rolEfectivo).toBe(rol);
    }
  });

  it('un admin_organizacion NO ve un caso de otra organización', async () => {
    const { registro, auditoria } = montar();
    await registro.registrar({
      casoId: CASO,
      tipo: 'caso_creado',
      actor: { id: 'svc:voz', nombre: null, tipo: 'servicio' },
      organizacionId: 'org-ajena',
    });

    await expect(
      auditoria.expediente(
        CASO,
        actor({ roles: ['admin_organizacion'], organizacionId: 'org-mia' }),
      ),
    ).rejects.toThrow(/otra organización/);
  });

  it('un admin_organizacion sí ve el suyo', async () => {
    const { registro, auditoria } = montar();
    await registro.registrar({
      casoId: CASO,
      tipo: 'caso_creado',
      actor: { id: 'svc:voz', nombre: null, tipo: 'servicio' },
      organizacionId: 'org-mia',
    });

    const expediente = await auditoria.expediente(
      CASO,
      actor({ roles: ['admin_organizacion'], organizacionId: 'org-mia' }),
    );
    expect(expediente.filas.length).toBeGreaterThan(0);
  });

  it('un caso sin organización registrada no se le concede a un admin_organizacion', async () => {
    // "No sé de quién es" nunca cuenta como "es tuyo".
    const { registro, auditoria } = montar();
    await registro.registrar({
      casoId: CASO,
      tipo: 'caso_creado',
      actor: { id: 'svc:voz', nombre: null, tipo: 'servicio' },
    });

    await expect(
      auditoria.expediente(
        CASO,
        actor({ roles: ['admin_organizacion'], organizacionId: 'org-mia' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AuditoriaService · la lectura deja rastro', () => {
  it('abrir el expediente escribe su propio evento, con actor y hora', async () => {
    const { registro, auditoria } = montar();
    await auditoria.expediente(CASO, actor({ id: 'turno:auditora' }));

    const eventos = await registro.listar(CASO);
    const lectura = eventos.find((e) => e.tipo === 'lectura_auditoria');
    expect(lectura).toBeDefined();
    expect(lectura?.actor.id).toBe('turno:auditora');
    expect(lectura?.detalle.rolEfectivo).toBe('auditor');
    expect(Date.parse(lectura!.ocurridoEn)).not.toBeNaN();
  });

  it('la lectura se ve en el propio expediente que la generó', async () => {
    const { auditoria } = montar();
    const expediente = await auditoria.expediente(CASO, actor());
    expect(expediente.filas.some((f) => f.tipo === 'lectura_auditoria')).toBe(true);
  });

  it('un intento denegado no se cuela como lectura concedida', async () => {
    const { registro, auditoria } = montar();
    await auditoria
      .expediente(CASO, actor({ roles: [] }))
      .catch(() => undefined);
    expect(await registro.listar(CASO)).toHaveLength(0);
  });
});

describe('AuditoriaService · la redacción', () => {
  const decision: StoredRoutingDecision = {
    caseId: CASO,
    state: 'matched',
    evidence: EVIDENCIA,
  };

  it('el dictado crudo y el origen del paciente no salen para NADIE', async () => {
    for (const rol of ['auditor', 'regulador_crue'] as const) {
      const { auditoria } = montar(decision);
      const expediente = await auditoria.expediente(CASO, actor({ roles: [rol] }));
      const inputs = expediente.evidencia?.inputs as Record<string, unknown>;

      expect(inputs.textoCrudo).toBe(MARCA);
      expect(inputs.origen).toBe(MARCA);
      // Y no se cuela por el JSON completo, que es lo que se exporta.
      const crudo = JSON.stringify(expediente);
      expect(crudo).not.toContain('carrera 30');
      expect(crudo).not.toContain('-74.08');
    }
  });

  it('el auditor externo no ve la narrativa clínica; el regulador sí', async () => {
    const externo = montar(decision);
    const operativo = montar(decision);

    const delAuditor = await externo.auditoria.expediente(
      CASO,
      actor({ roles: ['auditor'] }),
    );
    const delCrue = await operativo.auditoria.expediente(
      CASO,
      actor({ roles: ['regulador_crue'] }),
    );

    const aud = delAuditor.evidencia?.inputs as Record<string, unknown>;
    const crue = delCrue.evidencia?.inputs as Record<string, unknown>;

    expect(aud.resumen).toBe(MARCA);
    expect(crue.resumen).toBe('IAM con elevación del ST');
    // Lo CODIFICADO sale para los dos: es lo que hace auditable el ruteo.
    expect(aud.dxCie10).toBe('I21.1');
    expect(aud.triage).toBe(2);
  });

  it('dice qué se redactó y por qué', async () => {
    const { auditoria } = montar(decision);
    const expediente = await auditoria.expediente(CASO, actor({ roles: ['auditor'] }));
    expect(expediente.politicaRedaccion.claves).toContain('textoCrudo');
    expect(expediente.politicaRedaccion.motivo).toMatch(/no salen del servidor/);
  });
});

describe('AuditoriaService · la evidencia del ruteo', () => {
  it('trae candidatos, descartados con motivo, minutos y procedencia del ETA', async () => {
    const { auditoria } = montar({ caseId: CASO, state: 'matched', evidence: EVIDENCIA });
    const expediente = await auditoria.expediente(CASO, actor());

    expect(expediente.evidencia?.modelVersion).toBe('routing-v1');
    expect(expediente.evidencia?.configVersion).toBe('routing-config-v1');
    expect(expediente.evidencia?.etaProvenance).toBe('haversine_fallback');
    expect(expediente.evidencia?.minuteBreakdown.ruta).toBe(12);
    expect(expediente.evidencia?.candidates).toHaveLength(2);
  });

  it('sin evento match_calculado, la evidencia se muestra igual y declara de dónde sale', async () => {
    const { auditoria } = montar({ caseId: CASO, state: 'matched', evidence: EVIDENCIA });
    const expediente = await auditoria.expediente(CASO, actor());

    const fila = expediente.filas.find((f) => f.tipo === 'match_calculado');
    expect(fila?.fuente).toBe('pulso_routing_decision_audit');
    // Sin hora inventada: la fuente no la sella.
    expect(fila?.ocurridoEn).toBeNull();
  });

  it('un caso escalado al CRUE guarda la decisión aunque no haya destino', async () => {
    const { auditoria } = montar({ caseId: CASO, state: 'escalated_to_crue' });
    const expediente = await auditoria.expediente(CASO, actor());
    expect(expediente.evidencia?.estado).toBe('escalated_to_crue');
    expect(expediente.evidencia?.selectedDestination).toBeNull();
  });
});

describe('AuditoriaService · lo que el expediente confiesa', () => {
  it('declara cuántos eventos sabe escribir el sistema hoy', async () => {
    const { auditoria } = montar();
    const expediente = await auditoria.expediente(CASO, actor());
    expect(expediente.cobertura.tiposCableados).toEqual([
      'override_crue',
      'lectura_auditoria',
    ]);
    expect(expediente.cobertura.nota).toMatch(/3\.2/);
  });

  it('declara que el registro vive en memoria y qué se pierde', async () => {
    const { auditoria } = montar();
    const expediente = await auditoria.expediente(CASO, actor());
    expect(expediente.registro.modo).toBe('memoria');
    expect(expediente.registro.advertencia).toMatch(/reinicia/);
  });

  it('una corrección viaja con el id del evento que corrige', async () => {
    const { registro, auditoria } = montar();
    const original = await registro.registrar({
      casoId: CASO,
      tipo: 'llegada_puerta',
      actor: { id: 'turno:paramedico', nombre: null, tipo: 'humano' },
      detalle: { hora: '22:14' },
    });
    await registro.registrar({
      casoId: CASO,
      tipo: 'llegada_puerta',
      actor: { id: 'turno:paramedico', nombre: null, tipo: 'humano' },
      corrigeA: original.id,
      detalle: { hora: '22:11' },
    });

    const expediente = await auditoria.expediente(CASO, actor());
    const correccion = expediente.filas.find((f) => f.corrigeA !== null);
    expect(correccion?.corrigeA).toBe(original.id);
    // Y el original sigue ahí: el error se ve.
    expect(
      expediente.filas.filter((f) => f.tipo === 'llegada_puerta'),
    ).toHaveLength(2);
  });
});
