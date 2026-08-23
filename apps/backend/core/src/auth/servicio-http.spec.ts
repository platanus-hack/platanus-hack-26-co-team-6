/**
 * La costura completa por HTTP: emitir el token de servicio y usarlo.
 *
 * Levanta una app Nest de verdad con AuthModule (que registra el APP_GUARD
 * global) y dos rutas de mentira que imitan a las reales — `/triage`, que `voz`
 * sí puede llamar, y `/handshake/respond`, que no. Es lo más cerca del sistema
 * real que se puede llegar sin depender de los módulos de dominio, que están
 * en obra por otras tareas de la ola.
 */

import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthModule } from './auth.module';

const SECRETO = 'secreto-de-pruebas-largo-1';
const ADMIN = 'credencial-de-plataforma-1';

/** Las rutas reales viven en otros módulos; aquí importan solo sus URLs. */
@Controller()
class RutasDeMentira {
  @Post('triage')
  triage(): { ok: true } {
    return { ok: true };
  }

  @Get('estado')
  estado(): { ok: true } {
    return { ok: true };
  }

  @Post('handshake/respond')
  responder(): { ok: true } {
    return { ok: true };
  }
}

describe('token de servicio de punta a punta', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          // Sin esto leería apps/backend/core/.env de la máquina de quien corre
          // los tests, y la prueba pasaría o fallaría según su .env.
          ignoreEnvFile: true,
          load: [
            () => ({
              SESION_SECRET: SECRETO,
              OPERADOR_PASSWORD: 'turno',
              PULSO_ADMIN_TOKEN: ADMIN,
            }),
          ],
        }),
        AuthModule,
      ],
      controllers: [RutasDeMentira],
    }).compile();

    app = modulo.createNestApplication();
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  async function tokenDeVoz(): Promise<string> {
    const r = await http
      .post('/auth/servicio')
      .set('x-pulso-admin-token', ADMIN)
      .send({ nombre: 'voz' })
      .expect(201);
    return (r.body as { token: string }).token;
  }

  it('POST /auth/servicio sin la credencial de plataforma → 403', async () => {
    await http.post('/auth/servicio').send({ nombre: 'voz' }).expect(403);
    await http
      .post('/auth/servicio')
      .set('x-pulso-admin-token', 'adivinada')
      .send({ nombre: 'voz' })
      .expect(403);
  });

  it('con la credencial emite svc:voz con su alcance', async () => {
    const r = await http
      .post('/auth/servicio')
      .set('x-pulso-admin-token', ADMIN)
      .send({ nombre: 'voz' })
      .expect(201);

    expect(r.body).toMatchObject({
      sub: 'svc:voz',
      alcance: ['caso:crear', 'caso:leer', 'notificar'],
    });
  });

  it('voz crea casos y consulta estado con su token', async () => {
    const token = await tokenDeVoz();
    await http
      .post('/triage')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await http
      .get('/estado')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('voz intentando POST /handshake/respond → 403', async () => {
    // El requisito de la tarea, por HTTP: `voz` no acepta traslados.
    const token = await tokenDeVoz();
    const r = await http
      .post('/handshake/respond')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect((r.body as { message: string }).message).toContain(
      'handshake:responder',
    );
  });

  it('sin token sigue siendo 401', async () => {
    await http.post('/triage').expect(401);
  });

  it('el humano con la contraseña de turno sí puede responder el handshake', async () => {
    const login = await http
      .post('/auth/login')
      .send({ password: 'turno' })
      .expect(200);
    const cookie = login.headers['set-cookie'] as unknown as string[];

    await http.post('/handshake/respond').set('Cookie', cookie).expect(201);
  });

  it('y esa contraseña NO sirve para emitir tokens de servicio', async () => {
    const login = await http
      .post('/auth/login')
      .send({ password: 'turno' })
      .expect(200);
    const cookie = login.headers['set-cookie'] as unknown as string[];

    await http
      .post('/auth/servicio')
      .set('Cookie', cookie)
      .send({ nombre: 'voz' })
      .expect(403);
  });
});
