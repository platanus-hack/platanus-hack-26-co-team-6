/**
 * Las dos rutas nuevas, por HTTP.
 *
 * Los specs de servicio prueban las reglas; este prueba que estén CABLEADAS:
 * que el endpoint exista, que devuelva el código correcto y que el actor se
 * resuelva desde la petición. Es la diferencia entre "la regla está escrita"
 * y "la regla se aplica cuando alguien llama".
 *
 * El SesionGuard no entra aquí (AuthModule no se importa): esto no prueba la
 * autenticación, prueba la autorización por rol, que es la que estas dos
 * tareas agregan.
 */

import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AlmacenModule } from '../almacen/almacen.module';
import { AlmacenService } from '../almacen/almacen.service';
import type { Caso } from '../contracts/types';
import { EscalamientoModule } from '../escalamiento/escalamiento.module';
import { EventosModule } from '../eventos/eventos.module';
import { VAR_ROLES } from '../eventos/actor.service';
import { RoutingModule } from '../routing/routing.module';
import { AuditoriaModule } from './auditoria.module';

const CASO: Caso = {
  id: 'caso-http',
  resumen: 'IAM',
  triage: 2,
  dxCie10: 'I21.1',
  dxDescripcion: 'Infarto agudo',
  serviciosRequeridos: [743],
  complejidadRequerida: 'alta',
  edad: 54,
  sexo: 'M',
  signosAlarma: [],
  requiereMedicoABordo: true,
  confianza: 0.9,
  textoCrudo: 'dictado literal que no sale de aquí',
  origen: { lat: 4.6, lng: -74.08 },
  tipoMovil: 'TAM',
  unidad: { id: 'AMB-014' },
  creadoEn: '2026-08-22T22:00:00.000Z',
};

async function levantar(roles: string): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      AlmacenModule,
      RoutingModule,
      EventosModule,
      EscalamientoModule,
      AuditoriaModule,
    ],
  })
    // Los roles del turno los declara el SERVIDOR (ver actor.service.ts). Que
    // aquí se inyecten por config y no por cabecera es justo el punto: un
    // encabezado con el rol sería falsificable desde el navegador.
    .overrideProvider(ConfigService)
    .useValue({ get: (clave: string) => (clave === VAR_ROLES ? roles : undefined) })
    .compile();

  const app = modulo.createNestApplication();
  await app.init();
  app.get(AlmacenService).guardarCaso(CASO);
  return app;
}

describe('POST /casos/:id/override', () => {
  it('sin justificación responde 400', async () => {
    const app = await levantar('regulador_crue');
    await request(app.getHttpServer())
      .post(`/casos/${CASO.id}/override`)
      .send({ sedeCodigo: 'S-9', justificacion: '  ' })
      .expect(400);
    await app.close();
  });

  it('sin el rol de regulador responde 403 aunque la justificación esté', async () => {
    const app = await levantar('auditor');
    await request(app.getHttpServer())
      .post(`/casos/${CASO.id}/override`)
      .send({
        sedeCodigo: 'S-9',
        justificacion: 'Única sede con hemodinamia confirmada por teléfono.',
      })
      .expect(403);
    await app.close();
  });

  it('sin roles declarados en el servidor, nadie fuerza nada', async () => {
    const app = await levantar('');
    const res = await request(app.getHttpServer())
      .post(`/casos/${CASO.id}/override`)
      .send({
        sedeCodigo: 'S-9',
        justificacion: 'Única sede con hemodinamia confirmada por teléfono.',
      })
      .expect(403);
    // El 403 explica qué falta: un 403 mudo manda a alguien a leer código.
    expect(res.body.message).toMatch(/PULSO_ROLES_TURNO/);
    await app.close();
  });
});

describe('GET /auditoria/casos/:id', () => {
  it('sin rol lector responde 403', async () => {
    const app = await levantar('paramedico');
    await request(app.getHttpServer())
      .get(`/auditoria/casos/${CASO.id}`)
      .expect(403);
    await app.close();
  });

  it('el auditor recibe el expediente y su lectura queda registrada', async () => {
    const app = await levantar('auditor');
    const servidor = app.getHttpServer();

    const primera = await request(servidor)
      .get(`/auditoria/casos/${CASO.id}`)
      .expect(200);
    expect(primera.body.solicitante.rolEfectivo).toBe('auditor');
    expect(primera.body.filas).toHaveLength(1);
    expect(primera.body.filas[0].tipo).toBe('lectura_auditoria');

    // La segunda lectura ve la primera. El acceso deja rastro, siempre.
    const segunda = await request(servidor)
      .get(`/auditoria/casos/${CASO.id}`)
      .expect(200);
    expect(segunda.body.filas).toHaveLength(2);

    await app.close();
  });

  it('la línea de tiempo operativa se lee sin registrar acceso', async () => {
    const app = await levantar('regulador_crue');
    const servidor = app.getHttpServer();

    await request(servidor).get(`/casos/${CASO.id}/eventos`).expect(200);
    const res = await request(servidor).get(`/casos/${CASO.id}/eventos`).expect(200);

    expect(res.body.eventos).toHaveLength(0);
    // Y dice dónde vive el registro: memoria, se pierde al reiniciar.
    expect(res.body.modo).toBe('memoria');
    await app.close();
  });
});
