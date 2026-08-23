/**
 * Pruebas del constructor del borrador de RDA.
 *
 * Prueban COMPORTAMIENTO, no forma: que las referencias resuelvan, que los
 * huecos salgan declarados en vez de rellenos, que el dictado del paramédico
 * no se cuele en un documento que va a salir del servidor, y que nada de esto
 * nazca firmado.
 *
 * El caso de entrada es uno REAL: sale de `data/procesado/casos-demo.json`,
 * derivado de incidentes del 123 de Bogotá. La sede también: sale del catálogo
 * REPS compilado. Si el constructor solo funcionara con datos de juguete, esto
 * lo delata.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Caso, Sede } from '../contracts/types';
import { SEDES_CATALOGO } from '../sedes/catalogo.generado';
import { EVENTOS_DE_CIERRE, type EventoTrasladoRda } from './borrador';
import { construirBundleRda } from './constructor-rda';
import { CODESYSTEM, PERFIL } from './perfiles-ihce';
import type { Bundle, RecursoRda } from './tipos-fhir';

// ─────────────────────────────────────────────────────────────────
// Datos reales del repo
// ─────────────────────────────────────────────────────────────────

interface CasoDemo {
  incidente: string;
  triage: 1 | 2 | 3 | 4 | 5;
  edad: number | null;
  sexo: string;
  fecha: string;
  origen: { lat: number; lng: number };
  texto: string;
}

const DEMO: CasoDemo = (
  JSON.parse(
    readFileSync(
      resolve(__dirname, '../../../../../data/procesado/casos-demo.json'),
      'utf8',
    ),
  ) as { casos: CasoDemo[] }
).casos[0];

/** Una sede con código REPS de 12 dígitos, del catálogo compilado. */
const SEDE: Sede = SEDES_CATALOGO[0];

const DICTADO_LITERAL =
  'Unidad 14, tenemos paciente femenina de 80 anos en la carrera 7, dificultad respiratoria severa';
const TELEFONO = '+573001234567';

function casoDemo(sobrescribir: Partial<Caso> = {}): Caso {
  return {
    id: DEMO.incidente,
    resumen: DEMO.texto,
    triage: DEMO.triage,
    dxCie10: 'J96.0',
    dxDescripcion: 'Insuficiencia respiratoria aguda',
    serviciosRequeridos: [1102, 110],
    complejidadRequerida: 'alta',
    edad: DEMO.edad,
    sexo: DEMO.sexo === 'F' ? 'F' : 'M',
    signosAlarma: ['saturación 84%', 'uso de músculos accesorios'],
    requiereMedicoABordo: true,
    confianza: 0.82,
    // Los tres campos que NO pueden salir del servidor.
    textoCrudo: DICTADO_LITERAL,
    origen: DEMO.origen,
    telefonoReporta: TELEFONO,
    tipoMovil: 'TAM',
    unidad: { id: 'AMB-014', tripulante: 'Nombre Que No Debe Viajar' },
    creadoEn: `${DEMO.fecha}.000Z`,
    ...sobrescribir,
  };
}

const AHORA = '2026-06-01T01:30:00.000Z';

/** Todas las cadenas `reference` que hay en cualquier profundidad del Bundle. */
function referencias(bundle: Bundle): string[] {
  const encontradas: string[] = [];
  const recorrer = (valor: unknown) => {
    if (Array.isArray(valor)) return valor.forEach(recorrer);
    if (valor && typeof valor === 'object') {
      for (const [clave, hijo] of Object.entries(valor)) {
        if (clave === 'reference' && typeof hijo === 'string') {
          encontradas.push(hijo);
        } else {
          recorrer(hijo);
        }
      }
    }
  };
  recorrer(bundle.entry);
  return encontradas;
}

function recursos(bundle: Bundle, tipo: RecursoRda['resourceType']) {
  return bundle.entry
    .map((e) => e.resource)
    .filter((r) => r.resourceType === tipo);
}

// ─────────────────────────────────────────────────────────────────

describe('construirBundleRda — estructura del documento', () => {
  const borrador = construirBundleRda(casoDemo(), SEDE, [], AHORA);

  it('arma un Bundle FHIR R4 de tipo document', () => {
    expect(borrador.bundle.resourceType).toBe('Bundle');
    expect(borrador.bundle.type).toBe('document');
    expect(borrador.bundle.timestamp).toBe(AHORA);
    expect(borrador.bundle.identifier).toEqual({
      system: 'urn:pulso:rda:borrador',
      value: DEMO.incidente,
    });
    expect(borrador.bundle.meta?.profile).toEqual([PERFIL.bundleUrgencias]);
  });

  it('pone el Composition primero, como exige un Bundle document', () => {
    expect(borrador.bundle.entry[0].resource.resourceType).toBe('Composition');
  });

  it('cada entrada trae fullUrl único y un recurso identificado', () => {
    const urls = borrador.bundle.entry.map((e) => e.fullUrl);
    expect(urls.length).toBeGreaterThanOrEqual(4);
    expect(new Set(urls).size).toBe(urls.length);
    for (const entrada of borrador.bundle.entry) {
      expect(entrada.fullUrl).toBe(`urn:uuid:${entrada.resource.id}`);
      expect(entrada.resource.resourceType).toBeTruthy();
      expect(entrada.resource.meta?.profile?.length).toBeGreaterThan(0);
    }
  });

  it('TODA referencia interna resuelve contra un fullUrl del mismo Bundle', () => {
    const urls = new Set(borrador.bundle.entry.map((e) => e.fullUrl));
    const refs = referencias(borrador.bundle);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(urls.has(ref)).toBe(true);
  });

  it('es determinista: el mismo caso produce el mismo documento', () => {
    const otra = construirBundleRda(casoDemo(), SEDE, [], AHORA);
    expect(JSON.stringify(otra)).toEqual(JSON.stringify(borrador));
  });
});

describe('construirBundleRda — nada se firma solo', () => {
  it('el borrador siempre nace pendiente y sin firma', () => {
    const combinaciones = [
      construirBundleRda(casoDemo(), SEDE, [], AHORA),
      construirBundleRda(casoDemo({ dxCie10: null }), null, [], AHORA),
      construirBundleRda(
        casoDemo(),
        SEDE,
        [{ tipo: EVENTOS_DE_CIERRE[0], ocurridoEn: AHORA }],
        AHORA,
      ),
    ];
    for (const b of combinaciones) {
      expect(b.estado).toBe('pendiente');
      expect(b.firma).toBeNull();
    }
  });

  it('el Composition queda preliminary hasta que un humano lo firme', () => {
    const b = construirBundleRda(casoDemo(), SEDE, [], AHORA);
    expect(recursos(b.bundle, 'Composition')[0]).toMatchObject({
      status: 'preliminary',
      title: 'RDA Urgencias',
    });
  });

  it('dice que pre-llena, no que reporta al IHCE', () => {
    const b = construirBundleRda(casoDemo(), SEDE, [], AHORA);
    expect(b.aviso).toMatch(/PRE-LLENA/);
    expect(b.aviso).toMatch(/NO lo reporta al IHCE/);
    expect(JSON.stringify(b)).not.toMatch(/reporta al IHCE(?! ni)/);
  });
});

describe('construirBundleRda — los huecos salen declarados, no rellenos', () => {
  it('sin dxCie10 no inventa un Condition: declara el hueco', () => {
    const b = construirBundleRda(
      casoDemo({ dxCie10: null, dxDescripcion: 'Dificultad respiratoria' }),
      SEDE,
      [],
      AHORA,
    );
    expect(recursos(b.bundle, 'Condition')).toHaveLength(0);
    const hueco = b.huecos.find((h) => h.id === 'diagnostico-sin-cie10');
    expect(hueco).toBeDefined();
    expect(hueco?.severidad).toBe('bloqueante');
    expect(hueco?.porQue).toBeTruthy();
    expect(hueco?.contexto).toMatchObject({
      dxDescripcion: 'Dificultad respiratoria',
    });
    // Y no queda ninguna referencia a un diagnóstico que no existe.
    const urls = new Set(b.bundle.entry.map((e) => e.fullUrl));
    for (const ref of referencias(b.bundle)) expect(urls.has(ref)).toBe(true);
  });

  it('con dxCie10 emite el Condition en CIE-10, provisional, no confirmado', () => {
    const b = construirBundleRda(casoDemo(), SEDE, [], AHORA);
    const condicion = recursos(b.bundle, 'Condition')[0] as any;
    expect(condicion.code.coding[0]).toMatchObject({
      system: 'http://hl7.org/fhir/sid/icd-10',
      code: 'J96.0',
    });
    expect(condicion.verificationStatus.coding[0].code).toBe('provisional');
    expect(b.huecos.map((h) => h.id)).toContain('diagnostico-provisional');
  });

  it('no hay Patient ni Practitioner, y ambos huecos son bloqueantes', () => {
    const b = construirBundleRda(casoDemo(), SEDE, [], AHORA);
    expect(
      b.bundle.entry.filter((e) =>
        ['Patient', 'Practitioner'].includes(e.resource.resourceType),
      ),
    ).toHaveLength(0);
    for (const id of ['paciente-seudonimo', 'profesional-sin-identidad']) {
      const h = b.huecos.find((x) => x.id === id);
      expect(h?.severidad).toBe('bloqueante');
      expect(h?.quienLoAporta).toBeTruthy();
    }
    // Y no hay ningún `subject` apuntando a un paciente que no existe.
    for (const entrada of b.bundle.entry) {
      expect((entrada.resource as any).subject).toBeUndefined();
    }
  });

  it('sin sede aceptada no hay Organization y el Bundle sigue resolviendo', () => {
    const b = construirBundleRda(casoDemo(), null, [], AHORA);
    expect(recursos(b.bundle, 'Organization')).toHaveLength(0);
    expect(b.huecos.map((h) => h.id)).toEqual(
      expect.arrayContaining(['ips-sin-definir', 'composicion-sin-autor']),
    );
    const urls = new Set(b.bundle.entry.map((e) => e.fullUrl));
    for (const ref of referencias(b.bundle)) expect(urls.has(ref)).toBe(true);
    expect(b.cobertura.ausentes).toContain('CareDeliveryOrganizationRDA');
  });

  it('los bloqueantes van primero y ningún hueco se repite', () => {
    const b = construirBundleRda(casoDemo(), SEDE, [], AHORA);
    const ids = b.huecos.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    const severidades = b.huecos.map((h) => h.severidad);
    expect(severidades.indexOf('bloqueante')).toBe(0);
    expect(severidades.lastIndexOf('bloqueante')).toBeLessThan(
      severidades.indexOf('por-verificar'),
    );
  });
});

describe('construirBundleRda — lo que PULSO sí sabe', () => {
  it('codifica el triage con el CodeSystem del IHCE y cero a la izquierda', () => {
    const b = construirBundleRda(casoDemo({ triage: 2 }), SEDE, [], AHORA);
    const obs = recursos(b.bundle, 'Observation')[0] as any;
    expect(obs.status).toBe('final');
    expect(obs.code.coding[0]).toMatchObject({
      system: 'http://snomed.info/sct',
      code: '225390008',
    });
    expect(obs.valueCodeableConcept.coding[0]).toEqual({
      system: CODESYSTEM.claseTriage,
      code: '02',
      display: 'Triage II',
    });
  });

  it('la IPS lleva el código de habilitación de sede REPS de 12 dígitos', () => {
    const b = construirBundleRda(casoDemo(), SEDE, [], AHORA);
    const org = recursos(b.bundle, 'Organization')[0] as any;
    expect(org.identifier[0]).toMatchObject({
      use: 'official',
      system: 'https://fhir.minsalud.gov.co/rda/NamingSystem/REPS',
      value: SEDE.codigo,
    });
    expect(SEDE.codigo).toMatch(/^\d{12}$/);
    expect(org.name).toBe(SEDE.nombre);
    // Exige 2 identificadores y solo tenemos uno: se dice, no se inventa el NIT.
    expect(org.identifier).toHaveLength(1);
    expect(b.huecos.map((h) => h.id)).toContain('ips-sin-nit');
  });

  it('emite una orden por servicio requerido, con el código REPS real', () => {
    const b = construirBundleRda(casoDemo(), SEDE, [], AHORA);
    const ordenes = recursos(b.bundle, 'ServiceRequest') as any[];
    expect(ordenes).toHaveLength(2);
    expect(ordenes.map((o) => o.code.coding[0].code).sort()).toEqual([
      '110',
      '1102',
    ]);
    expect(ordenes[0].code.coding[0].system).toBe(CODESYSTEM.serviciosReps);
    // El perfil pide CUPS, no REPS. Se declara en vez de traducirlo a ciegas.
    expect(b.huecos.map((h) => h.id)).toContain('servicios-reps-no-cups');
  });

  it('un caso cerrado marca el encuentro finished con period.end', () => {
    const eventos: EventoTrasladoRda[] = [
      { tipo: 'despachado', ocurridoEn: '2026-06-01T00:50:00.000Z' },
      { tipo: 'llegada_puerta', ocurridoEn: '2026-06-01T01:12:00.000Z' },
    ];
    const b = construirBundleRda(casoDemo(), SEDE, eventos, AHORA);
    const enc = recursos(b.bundle, 'Encounter')[0] as any;
    expect(enc.status).toBe('finished');
    expect(enc.period).toEqual({
      start: `${DEMO.fecha}.000Z`,
      end: '2026-06-01T01:12:00.000Z',
    });
    expect(b.huecos.map((h) => h.id)).not.toContain('encuentro-sin-cierre');
  });

  it('un caso todavía en curso lo dice, en vez de sellar un finished falso', () => {
    const b = construirBundleRda(casoDemo(), SEDE, [], AHORA);
    const enc = recursos(b.bundle, 'Encounter')[0] as any;
    expect(enc.status).toBe('in-progress');
    expect(enc.period.end).toBeUndefined();
    expect(b.huecos.find((h) => h.id === 'encuentro-sin-cierre')?.severidad).toBe(
      'bloqueante',
    );
  });

  it('mide la cobertura contra los perfiles que el Bundle exige 1..1', () => {
    const b = construirBundleRda(casoDemo(), SEDE, [], AHORA);
    expect(b.cobertura.presentes).toEqual(
      expect.arrayContaining([
        'CompositionEmergencyRDA',
        'EncounterEmergencyRDA',
        'CareDeliveryOrganizationRDA',
      ]),
    );
    expect(b.cobertura.ausentes).toEqual([
      'PatientRDA',
      'PractitionerRDA',
      'DocumentReferenceEPIRDA',
    ]);
    expect(b.cobertura.proporcion).toBeCloseTo(0.5, 2);
  });
});

describe('construirBundleRda — sin PII', () => {
  it('ni el dictado literal, ni el punto de recogida, ni el teléfono salen', () => {
    const caso = casoDemo();
    const serializado = JSON.stringify(
      construirBundleRda(caso, SEDE, [], AHORA),
    );
    expect(serializado).not.toContain(DICTADO_LITERAL);
    expect(serializado).not.toContain(TELEFONO);
    expect(serializado).not.toContain(String(caso.origen.lat));
    expect(serializado).not.toContain(String(caso.origen.lng));
    // El nombre del tripulante es texto libre de quien tenga la contraseña de
    // turno: no puede convertirse en la identidad de un profesional.
    expect(serializado).not.toContain('Nombre Que No Debe Viajar');
  });
});
