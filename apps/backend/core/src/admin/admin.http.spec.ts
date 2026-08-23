/**
 * La superficie HTTP, con el guard puesto.
 *
 * Los tests de `acceso-admin.spec.ts` prueban la DECISION; estos prueban que
 * la decision efectivamente llega al cliente como 403 y no como 200 por un
 * decorador que alguien olvido. Es la diferencia entre tener la regla y
 * aplicarla.
 *
 * Se monta el modulo a mano en vez de importar `AdminModule` para poder
 * sustituir `SesionService` (que en la app real llega por el AuthModule
 * @Global). Los controladores y providers son exactamente los del modulo.
 */

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SesionService } from '../auth/sesion.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { CatalogosController } from './catalogos.controller';
import { CatalogosService } from './catalogos.service';
import { ModelosController } from './modelos.controller';
import { ModelosService } from './modelos.service';
import { ALMACEN_ADMIN, AlmacenAdminMemoria } from './almacen-admin';

/** Lo que devolveria `SesionService.verificar()` en cada escenario. */
interface Escenario {
  carga: unknown;
  adminConfigurado?: boolean;
  tokenBueno?: string;
}

const CREDENCIAL = 'token-de-plataforma-de-prueba';

async function montar(escenario: Escenario): Promise<INestApplication> {
  const sesion = {
    verificar: () => escenario.carga,
    verificarAdminPlataforma: (t?: string) =>
      (escenario.adminConfigurado ?? true) && t === (escenario.tokenBueno ?? CREDENCIAL),
    emisionDeServicioHabilitada: () => escenario.adminConfigurado ?? true,
  };

  const modulo = await Test.createTestingModule({
    controllers: [AdminController, CatalogosController, ModelosController],
    providers: [
      AdminGuard,
      CatalogosService,
      ModelosService,
      { provide: ALMACEN_ADMIN, useFactory: () => new AlmacenAdminMemoria() },
      { provide: SesionService, useValue: sesion },
    ],
  }).compile();

  const app = modulo.createNestApplication();
  await app.init();
  return app;
}

describe('solo admin_plataforma, verificado en el servidor', () => {
  let app: INestApplication;
  afterEach(async () => {
    await app?.close();
  });

  it('admin_organizacion → 403', async () => {
    // El checklist de 5.11, por HTTP. Y con la credencial de plataforma
    // puesta: tener el token no salva a un rol que no es.
    app = await montar({
      carga: { sub: 'act_9', tip: 'humano', roles: ['admin_organizacion'] },
    });

    await request(app.getHttpServer())
      .get('/admin/catalogos')
      .set('x-pulso-admin', CREDENCIAL)
      .expect(403);

    await request(app.getHttpServer())
      .post('/admin/catalogos/motivo_rechazo')
      .set('x-pulso-admin', CREDENCIAL)
      .send({ codigo: 'X_Y', etiqueta: 'x', datos: { categoria: 'otro' } })
      .expect(403);

    await request(app.getHttpServer()).get('/admin/modelos').expect(403);
    await request(app.getHttpServer()).get('/admin/eventos').expect(403);
  });

  it('admin_plataforma entra por rol, sin credencial de puente', async () => {
    app = await montar({
      carga: { sub: 'act_7', tip: 'humano', roles: ['admin_plataforma'] },
    });
    const res = await request(app.getHttpServer()).get('/admin/catalogos').expect(200);
    expect(res.body.catalogos).toHaveLength(3);
  });

  it('un token de servicio no administra logica clinica', async () => {
    app = await montar({ carga: { sub: 'svc:voz', tip: 'servicio' } });
    await request(app.getHttpServer())
      .get('/admin/catalogos')
      .set('x-pulso-admin', CREDENCIAL)
      .expect(403);
  });

  it('sin sesion → 401, no 403: hay que renovar, no rendirse', async () => {
    app = await montar({ carga: null });
    await request(app.getHttpServer()).get('/admin/catalogos').expect(401);
  });

  it('sin PULSO_ADMIN_TOKEN nadie pasa, ni con cabecera', async () => {
    app = await montar({ carga: { sub: 'operador', tip: 'humano' }, adminConfigurado: false });
    await request(app.getHttpServer())
      .get('/admin/catalogos')
      .set('x-pulso-admin', CREDENCIAL)
      .expect(403);
  });
});

describe('GET /admin/acceso explica en vez de callar', () => {
  let app: INestApplication;
  afterEach(async () => {
    await app?.close();
  });

  it('responde 200 aunque niegue, y dice por que', async () => {
    app = await montar({ carga: { sub: 'act_9', tip: 'humano', roles: ['admin_organizacion'] } });
    const res = await request(app.getHttpServer()).get('/admin/acceso').expect(200);

    expect(res.body.permitido).toBe(false);
    expect(res.body.motivo).toBe('sin-rol-admin');
    expect(res.body.identidadReal).toBe(true);
  });

  it('declara las degradaciones: memoria y motor sin cablear', async () => {
    app = await montar({ carga: { sub: 'act_7', tip: 'humano', roles: ['admin_plataforma'] } });
    const res = await request(app.getHttpServer()).get('/admin/acceso').expect(200);

    expect(res.body.permitido).toBe(true);
    expect(res.body.persistencia).toBe('memoria');
    expect(res.body.degradacion.join(' ')).toMatch(/memoria/i);
    expect(res.body.degradacion.join(' ')).toMatch(/no lee de estos catálogos/i);
  });
});

describe('el flujo completo por HTTP', () => {
  let app: INestApplication;
  const admin = { carga: { sub: 'act_7', tip: 'humano', roles: ['admin_plataforma'] } };

  beforeEach(async () => {
    app = await montar(admin);
  });
  afterEach(async () => {
    await app?.close();
  });

  it('editar una etiqueta deja historico, diff y evento', async () => {
    const servidor = app.getHttpServer();

    await request(servidor)
      .post('/admin/catalogos/motivo_rechazo/SIN_CAMA_UCI/versiones')
      .send({
        etiqueta: 'Sin disponibilidad de camas de cuidado intensivo',
        datos: { categoria: 'capacidad', requiereDetalle: false },
        motivo: 'Comité clínico de agosto',
      })
      .expect(201);

    const historial = await request(servidor)
      .get('/admin/catalogos/motivo_rechazo/SIN_CAMA_UCI')
      .expect(200);

    expect(historial.body.versiones).toHaveLength(2);
    expect(historial.body.versiones[0].etiqueta).toBe('Sin camas UCI disponibles');
    expect(historial.body.vigente.version).toBe(2);
    expect(historial.body.vigente.codigo).toBe('SIN_CAMA_UCI');

    const eventos = await request(servidor)
      .get('/admin/eventos?codigo=SIN_CAMA_UCI')
      .expect(200);
    expect(eventos.body.eventos[0].accion).toBe('version.creada');
    expect(eventos.body.eventos[0].actor).toBe('act_7');
  });

  it('resolver un Dx sin mapeo dice "escala a criterio humano"', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/catalogos/resolver-dx?dx=E10.1&propuesto=110')
      .expect(200);

    expect(res.body.resolucion.estado).toBe('sin-mapeo');
    expect(res.body.resolucion.accion).toBe('escala-a-criterio-humano');
    expect(res.body.decision.estado).toBe('escala-a-criterio-humano');
    expect(res.body.decision).not.toHaveProperty('serviciosRequeridos');
  });

  it('resolver un IAM devuelve lo que decide la tabla', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/catalogos/resolver-dx?dx=I21.1&propuesto=110,743')
      .expect(200);

    expect(res.body.decision.estado).toBe('tabla-decide');
    expect(res.body.decision.serviciosRequeridos).toEqual([743]);
    expect(res.body.decision.propuestosNoExigidos).toEqual([110]);
  });

  it('anota y consulta con que version se proceso un caso', async () => {
    const servidor = app.getHttpServer();

    await request(servidor)
      .post('/admin/modelos/procesamiento')
      .send({
        casoId: 'caso-viejo',
        coleccion: 'prompt_clinico',
        codigo: 'TRIAGE_EXTRACCION',
        procesadoEn: '2026-08-15T03:12:00.000Z',
      })
      .expect(201);

    const res = await request(servidor).get('/admin/modelos/casos/caso-viejo').expect(200);
    expect(res.body.procesamientos[0].registro.version).toBe(1);
    expect(res.body.procesamientos[0].registro.procesadoEn).toBe(
      '2026-08-15T03:12:00.000Z',
    );
  });

  it('un caso sin anotaciones lo dice en vez de devolver una lista muda', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/modelos/casos/caso-sin-nada')
      .expect(200);
    expect(res.body.sinRegistro).toBe(true);
    expect(res.body.nota).toMatch(/3\.12/);
  });

  it('no hay forma de borrar ni de modificar una version', async () => {
    const servidor = app.getHttpServer();
    await request(servidor).delete('/admin/catalogos/motivo_rechazo/SIN_CAMA_UCI').expect(404);
    await request(servidor).put('/admin/catalogos/motivo_rechazo/SIN_CAMA_UCI').expect(404);
    await request(servidor).patch('/admin/catalogos/motivo_rechazo/SIN_CAMA_UCI').expect(404);
  });
});
