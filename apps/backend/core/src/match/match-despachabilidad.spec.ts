/**
 * Tarea 2.1, paso 4 — «Solo `activa` es despachable: el ranking filtra por eso».
 *
 * El criterio de la tarea dice «una organizacion que no esta `activa` no
 * aparece en el ranking», y el ranking es esto: `MatchService.rankear`.
 * Probarlo solo en `AfiliacionService` dejaria sin cubrir justo el cable.
 *
 * ⚠️ Este archivo vive en `match/`, que es carril de Zaid. Es el unico sitio
 *    donde el criterio se puede verificar de verdad, y el cambio que prueba
 *    son las tres lineas del filtro en `match.service.ts`.
 */

import { Logger } from '@nestjs/common';
import type { Candidato, Caso, MatchResponse, Sede } from '../contracts/types';
import { RepoActoresMemoria } from '../auth/actores';
import { AfiliacionService } from '../afiliacion/afiliacion.service';
import { RepoOrganizacionesMemoria } from '../afiliacion/organizaciones';
import { SEDES_CATALOGO } from '../sedes/catalogo.generado';
import type { SedesService } from '../sedes/sedes.service';
import type { AlmacenService } from '../almacen/almacen.service';
import type { EtaService } from '../eta/eta.service';
import type { ScoringService } from '../scoring/scoring.service';
import { MatchService } from './match.service';

/** Tres sedes reales del catalogo. La primera es la que se va a afiliar. */
const [SEDE_A, SEDE_B, SEDE_C] = SEDES_CATALOGO;
const CLAVE = 'una-clave-larga-de-verdad';

const CASO: Caso = {
  id: 'caso-1',
  resumen: 'dolor toracico',
  triage: 2,
  dxCie10: null,
  dxDescripcion: 'dolor toracico',
  // Vacio a proposito: asi TODAS las sedes son compatibles y lo unico que
  // puede sacar a una del ranking es el filtro que se esta probando.
  serviciosRequeridos: [],
  complejidadRequerida: 'baja',
  edad: 60,
  sexo: 'M',
  signos: {},
  banderas: [],
  confianza: 0.9,
  textoCrudo: 'no sale de aqui',
  origen: SEDE_A.coord,
  tipoMovil: 'TAB',
  unidad: null,
  creadoEn: new Date().toISOString(),
} as unknown as Caso;

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

function montar() {
  const universo = [SEDE_A, SEDE_B, SEDE_C];

  const sedes = {
    cercanas: () => Promise.resolve(universo),
    todas: () => Promise.resolve(SEDES_CATALOGO),
    porCodigo: (codigo: string) =>
      Promise.resolve(SEDES_CATALOGO.find((s) => s.codigo === codigo)),
  } as unknown as SedesService;

  const eta = {
    matriz: (_origen: unknown, destinos: { codigo: string }[]) =>
      Promise.resolve(
        destinos.map((d, i) => ({
          codigo: d.codigo,
          etaMin: 5 + i,
          distKm: 1,
        })),
      ),
  } as unknown as EtaService;

  /**
   * Un candidato por sede evaluada: lo que entra, sale.
   *
   * Sin filtro duro ni score de verdad — eso es carril de Neid y tiene sus
   * propios tests. Aqui lo unico que puede cambiar la lista es el filtro de
   * despachabilidad, que es lo que se esta probando.
   */
  const scoring = {
    rankear: (_caso: Caso, evaluadas: Sede[]): Candidato[] =>
      evaluadas.map((sede, i) => candidato(sede, i + 1)),
  } as unknown as ScoringService;

  const almacen = {
    listarHandshakes: () => [],
  } as unknown as AlmacenService;

  const organizaciones = new RepoOrganizacionesMemoria();
  const actores = new RepoActoresMemoria({ get: () => undefined } as never);
  const afiliacion = new AfiliacionService(sedes, organizaciones, actores);

  return {
    match: new MatchService(sedes, eta, scoring, almacen, afiliacion),
    afiliacion,
  };
}

const codigosDe = (r: MatchResponse): string[] =>
  r.candidatos.map((c) => c.sede.codigo);

/** Un `Candidato` con lo justo. Los numeros no importan en estos tests. */
const candidato = (sede: Sede, rank: number): Candidato => ({
  sede,
  rank,
  etaMin: 5 + rank,
  distKm: 1,
  pAceptacion: 0.8,
  congestion: 0.2,
  score: rank,
  desglose: {} as Candidato['desglose'],
  serviciosFaltantes: [],
  motivoDescarte: null,
});

describe('el ranking y la despachabilidad de la afiliacion', () => {
  it('sin ninguna organizacion afiliada, el ranking sale completo', async () => {
    // Es el estado de hoy y del demo. Si este test se cayera, encender la
    // afiliacion vaciaria el ranking y cada caso escalaria al CRUE.
    const { match } = montar();
    expect(codigosDe(await match.rankear(CASO))).toEqual([
      SEDE_A.codigo,
      SEDE_B.codigo,
      SEDE_C.codigo,
    ]);
  });

  async function afiliar(codigo: string) {
    const { match, afiliacion } = montar();
    const { organizacion } = await afiliacion.crear({
      tipo: 'ips',
      nit: '900123456-1',
      razonSocial: SEDES_CATALOGO.find((s) => s.codigo === codigo)!.nombre,
      sedes: [codigo],
      admin: { nombre: 'Ana', correo: 'ana@ips.co', clave: CLAVE },
    });
    return { match, afiliacion, organizacion };
  }

  it('una sede afiliada y activa sigue en el ranking', async () => {
    const { match, afiliacion, organizacion } = await afiliar(SEDE_A.codigo);
    await afiliacion.transicionar(organizacion.id, 'activa');
    expect(codigosDe(await match.rankear(CASO))).toContain(SEDE_A.codigo);
  });

  it('suspenderla la saca del ranking, y solo a ella', async () => {
    const { match, afiliacion, organizacion } = await afiliar(SEDE_A.codigo);
    await afiliacion.transicionar(organizacion.id, 'activa');
    await afiliacion.transicionar(
      organizacion.id,
      'suspendida',
      'Habilitacion vencida',
    );

    const codigos = codigosDe(await match.rankear(CASO));
    expect(codigos).not.toContain(SEDE_A.codigo);
    // Las otras dos no se tocan: no estan afiliadas.
    expect(codigos).toEqual([SEDE_B.codigo, SEDE_C.codigo]);
  });

  it('una afiliada que se quedo en aprobada tampoco entra', async () => {
    // `aprobada` ≠ `activa`. Es el estado en el que nace una afiliacion
    // autoverificada, y el que obliga a un acto humano para despachar.
    const { match, organizacion } = await afiliar(SEDE_A.codigo);
    expect(organizacion.estado).toBe('aprobada');
    expect(codigosDe(await match.rankear(CASO))).not.toContain(SEDE_A.codigo);
  });

  it('retirarse tambien saca del ranking', async () => {
    const { match, afiliacion, organizacion } = await afiliar(SEDE_A.codigo);
    await afiliacion.transicionar(organizacion.id, 'retirada');
    expect(codigosDe(await match.rankear(CASO))).not.toContain(SEDE_A.codigo);
  });

  it('levantar la suspension la devuelve al ranking', async () => {
    // Caso limite 5 de §7: los casos en curso no se cancelan, y la sede
    // vuelve entera cuando se resuelve lo que la suspendio.
    const { match, afiliacion, organizacion } = await afiliar(SEDE_A.codigo);
    await afiliacion.transicionar(organizacion.id, 'activa');
    await afiliacion.transicionar(organizacion.id, 'suspendida', 'Revision');
    await afiliacion.transicionar(organizacion.id, 'activa');
    expect(codigosDe(await match.rankear(CASO))).toContain(SEDE_A.codigo);
  });
});
