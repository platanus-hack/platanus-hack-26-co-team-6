/**
 * Pruebas del servicio y de la ruta.
 *
 * Lo que se prueba aquí no es la forma del Bundle (eso está en
 * `constructor-rda.spec.ts`) sino las dos promesas operativas: que el borrador
 * sale `pendiente`, y que **no hay ninguna ruta que lo despache**.
 */

import { NotFoundException } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import type { Caso, Handshake, Sede } from '../contracts/types';
import { SEDES_CATALOGO } from '../sedes/catalogo.generado';
import type { AlmacenService } from '../almacen/almacen.service';
import type { SedesService } from '../sedes/sedes.service';
import { RdaController } from './rda.controller';
import { RdaService, eventosDesdeHandshakes } from './rda.service';

const SEDE: Sede = SEDES_CATALOGO[0];

const CASO: Caso = {
  id: 'caso-1',
  resumen: 'Hombre de 69 anos, perdida de consciencia',
  triage: 1,
  dxCie10: 'R55',
  dxDescripcion: 'Síncope y colapso',
  serviciosRequeridos: [1102],
  complejidadRequerida: 'alta',
  edad: 69,
  sexo: 'M',
  signosAlarma: ['sin respuesta a estímulos'],
  requiereMedicoABordo: true,
  confianza: 0.7,
  textoCrudo: 'dictado literal que no puede salir',
  origen: { lat: 4.6354, lng: -74.2058 },
  tipoMovil: 'TAM',
  unidad: { id: 'AMB-014' },
  creadoEn: '2026-06-18T00:27:00.000Z',
};

const HANDSHAKE_ACEPTADO: Handshake = {
  id: 'hs-1',
  casoId: CASO.id,
  sedeCodigo: SEDE.codigo,
  canal: 'consola',
  estado: 'aceptado',
  motivoRechazo: null,
  enviadoEn: '2026-06-18T00:29:00.000Z',
  expiraEn: '2026-06-18T00:29:45.000Z',
  respondidoEn: '2026-06-18T00:29:20.000Z',
  latenciaS: 20,
};

function servicio(caso: Caso | undefined, handshakes: Handshake[]) {
  const almacen = {
    obtenerCaso: () => caso,
    listarHandshakes: () => handshakes,
  } as unknown as AlmacenService;
  const sedes = {
    porCodigo: async (codigo: string) =>
      SEDES_CATALOGO.find((s) => s.codigo === codigo),
  } as unknown as SedesService;
  return new RdaService(almacen, sedes);
}

describe('RdaService', () => {
  it('devuelve el borrador en estado pendiente y sin firma', async () => {
    const b = await servicio(CASO, [HANDSHAKE_ACEPTADO]).borrador(CASO.id);
    expect(b.estado).toBe('pendiente');
    expect(b.firma).toBeNull();
    expect(b.casoId).toBe(CASO.id);
  });

  it('usa como IPS la sede que ACEPTÓ, no la que se le preguntó', async () => {
    const rechazado: Handshake = {
      ...HANDSHAKE_ACEPTADO,
      id: 'hs-0',
      sedeCodigo: SEDES_CATALOGO[1].codigo,
      estado: 'rechazado',
    };
    const b = await servicio(CASO, [rechazado, HANDSHAKE_ACEPTADO]).borrador(
      CASO.id,
    );
    const org = b.bundle.entry
      .map((e) => e.resource)
      .find((r) => r.resourceType === 'Organization') as any;
    expect(org.identifier[0].value).toBe(SEDE.codigo);
  });

  it('sin ninguna aceptación no hay IPS y lo declara', async () => {
    const b = await servicio(CASO, [
      { ...HANDSHAKE_ACEPTADO, estado: 'timeout' },
    ]).borrador(CASO.id);
    expect(
      b.bundle.entry.filter((e) => e.resource.resourceType === 'Organization'),
    ).toHaveLength(0);
    expect(b.huecos.map((h) => h.id)).toContain('ips-sin-definir');
  });

  it('un caso que no existe es 404, no un borrador vacío', async () => {
    await expect(servicio(undefined, []).borrador('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('el borrador no lleva el dictado literal ni el punto de recogida', async () => {
    const b = await servicio(CASO, [HANDSHAKE_ACEPTADO]).borrador(CASO.id);
    const serializado = JSON.stringify(b);
    expect(serializado).not.toContain(CASO.textoCrudo);
    expect(serializado).not.toContain(String(CASO.origen.lat));
  });
});

describe('eventosDesdeHandshakes', () => {
  it('traduce despacho y aceptación, en orden cronológico', () => {
    expect(eventosDesdeHandshakes([HANDSHAKE_ACEPTADO])).toEqual([
      {
        tipo: 'despachado',
        ocurridoEn: '2026-06-18T00:29:00.000Z',
        codigoSede: SEDE.codigo,
      },
      {
        tipo: 'aceptado',
        ocurridoEn: '2026-06-18T00:29:20.000Z',
        codigoSede: SEDE.codigo,
      },
    ]);
  });

  it('un handshake vencido no aporta aceptación', () => {
    const eventos = eventosDesdeHandshakes([
      { ...HANDSHAKE_ACEPTADO, estado: 'timeout' },
    ]);
    expect(eventos.map((e) => e.tipo)).toEqual(['despachado']);
  });
});

describe('RdaController — el borrador nunca se envía solo', () => {
  it('expone una sola ruta y es de lectura', () => {
    const metodos = Object.getOwnPropertyNames(RdaController.prototype).filter(
      (m) => m !== 'constructor',
    );
    expect(metodos).toEqual(['borrador']);
    for (const nombre of metodos) {
      const verbo = Reflect.getMetadata(
        'method',
        (RdaController.prototype as any)[nombre],
      );
      expect(verbo).toBe(RequestMethod.GET);
    }
  });

  it('no hay ninguna ruta de envío, reporte o transmisión', () => {
    const fuente = require('node:fs').readFileSync(
      require('node:path').resolve(__dirname, 'rda.controller.ts'),
      'utf8',
    ) as string;
    expect(fuente).not.toMatch(/@(Post|Put|Patch|Delete)\(/);
  });
});
