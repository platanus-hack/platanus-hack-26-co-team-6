/**
 * Los arreglos de seguridad, en ejecución.
 *
 * Cada `it` de aquí corresponde a un agujero real que estuvo abierto:
 *   - /estado servía la historia clínica entera sin sesión
 *   - /handshake/respond dejaba a cualquiera aceptar o rechazar un traslado
 *   - /telegram/webhook procesaba updates que nadie firmó
 *
 * Si alguno de estos tests se pone en rojo, no es un test frágil: es el
 * agujero otra vez. No lo borres, arréglalo.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type {
  DispatchResponse,
  MatchResponse,
  TriageResponse,
} from './../src/contracts/types';
import type { EstadoResponse } from './../src/estado/estado.service';

const PASSWORD = 'contrasena-de-prueba';
const SECRETO_TELEGRAM = 'secreto-de-webhook-de-prueba';

/**
 * supertest tipa `res.body` como any y el lint del repo lo prohíbe. Un único
 * punto de conversión, contra los tipos reales de core: si el contrato cambia,
 * estos tests dejan de compilar en vez de pasar sobre datos que ya no existen.
 */
function cuerpo<T>(res: request.Response): T {
  return res.body as T;
}

describe('Seguridad (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // ConfigModule lee process.env al construirse, así que esto va antes.
    process.env.OPERADOR_PASSWORD = PASSWORD;
    process.env.SESION_SECRET = 'secreto-de-firma-solo-para-los-tests';
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRETO_TELEGRAM;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const servidor = () => app.getHttpServer();

  /** Agente con la cookie de sesión ya puesta. */
  async function conSesion(): Promise<request.Agent> {
    const agente = request.agent(servidor());
    await agente.post('/auth/login').send({ password: PASSWORD }).expect(200);
    return agente;
  }

  // ── El guard global ────────────────────────────────────────────

  describe('sin sesión', () => {
    it('GET /estado responde 401', async () => {
      await request(servidor()).get('/estado').expect(401);
    });

    it('POST /triage responde 401', async () => {
      await request(servidor()).post('/triage').send({}).expect(401);
    });

    it('POST /match responde 401', async () => {
      await request(servidor()).post('/match').send({}).expect(401);
    });

    it('POST /dispatch responde 401', async () => {
      await request(servidor()).post('/dispatch').send({}).expect(401);
    });

    it('POST /handshake/respond responde 401', async () => {
      await request(servidor()).post('/handshake/respond').send({}).expect(401);
    });

    it('/health sigue abierto: es la sonda del balanceador', async () => {
      await request(servidor()).get('/health').expect(200, { status: 'ok' });
    });
  });

  // ── Login ──────────────────────────────────────────────────────

  describe('login', () => {
    it('rechaza la contraseña incorrecta', async () => {
      await request(servidor())
        .post('/auth/login')
        .send({ password: 'no-es' })
        .expect(401);
    });

    it('rechaza el cuerpo vacío', async () => {
      await request(servidor()).post('/auth/login').send({}).expect(401);
    });

    it('entrega una cookie HttpOnly, no un token en el body', async () => {
      const res = await request(servidor())
        .post('/auth/login')
        .send({ password: PASSWORD })
        .expect(200);

      const cookies = (res.headers['set-cookie'] as unknown as string[]).join(
        ';',
      );
      expect(cookies).toContain('pulso_sesion=');
      expect(cookies).toContain('HttpOnly');
      // Si el token viajara en el body, un XSS en las consolas se lo llevaría.
      expect(JSON.stringify(res.body)).not.toContain('pulso_sesion');
    });

    it('no acepta una cookie con la firma alterada', async () => {
      await request(servidor())
        .get('/estado')
        .set('Cookie', 'pulso_sesion=eyJzdWIiOiJvcGVyYWRvciJ9.firma-inventada')
        .expect(401);
    });

    it('con sesión, /estado responde 200', async () => {
      const agente = await conSesion();
      await agente.get('/estado').expect(200);
    });
  });

  // ── Minimización de PHI ────────────────────────────────────────

  describe('GET /estado', () => {
    it('no expone el dictado crudo ni las coordenadas del paciente', async () => {
      const agente = await conSesion();

      const res = await agente
        .post('/triage')
        .send({
          texto:
            'Hombre de 58 anos con dolor toracico opresivo irradiado a brazo izquierdo, sudoroso.',
        })
        .expect(201);
      const { caso } = cuerpo<TriageResponse>(res);

      // El caso completo SÍ los tiene: se conservan en el servidor.
      expect(caso.textoCrudo).toBeTruthy();
      expect(caso.origen).toBeTruthy();

      const estado = cuerpo<EstadoResponse>(
        await agente.get('/estado').expect(200),
      );
      const publico = estado.casos.find((c) => c.id === caso.id);

      expect(publico).toBeDefined();
      expect(publico).not.toHaveProperty('textoCrudo');
      expect(publico).not.toHaveProperty('origen');
      // Lo que las consolas sí pintan sigue estando.
      expect(publico?.resumen).toBeTruthy();
      expect(publico?.triage).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Webhook de Telegram ────────────────────────────────────────

  describe('POST /telegram/webhook', () => {
    /**
     * El webhook siempre responde 200 (Telegram reintenta ante cualquier otro
     * código). Lo que se comprueba no es el status: es que el handshake siga
     * en 'enviado' después de un intento de aceptación sin firmar.
     */
    async function handshakePendiente(agente: request.Agent): Promise<string> {
      const { caso } = cuerpo<TriageResponse>(
        await agente
          .post('/triage')
          .send({ texto: 'Paciente con trauma craneoencefalico, Glasgow 8.' })
          .expect(201),
      );

      const { candidatos } = cuerpo<MatchResponse>(
        await agente.post('/match').send({ caso }).expect(201),
      );

      const { handshake } = cuerpo<DispatchResponse>(
        await agente
          .post('/dispatch')
          .send({
            casoId: caso.id,
            sedeCodigo: candidatos[0].sede.codigo,
            canal: 'consola',
          })
          .expect(201),
      );

      return handshake.id;
    }

    async function estadoDe(
      agente: request.Agent,
      id: string,
    ): Promise<string | undefined> {
      const estado = cuerpo<EstadoResponse>(
        await agente.get('/estado').expect(200),
      );
      return estado.handshakes.find((h) => h.id === id)?.estado;
    }

    it('ignora el update sin el header de secreto', async () => {
      const agente = await conSesion();
      const id = await handshakePendiente(agente);

      await request(servidor())
        .post('/telegram/webhook')
        .send({ callback_query: { id: '1', data: `a:${id}` } })
        .expect(200);

      expect(await estadoDe(agente, id)).toBe('enviado');
    });

    it('ignora el update con un secreto incorrecto', async () => {
      const agente = await conSesion();
      const id = await handshakePendiente(agente);

      await request(servidor())
        .post('/telegram/webhook')
        .set('X-Telegram-Bot-Api-Secret-Token', 'secreto-equivocado')
        .send({ callback_query: { id: '1', data: `r:${id}` } })
        .expect(200);

      expect(await estadoDe(agente, id)).toBe('enviado');
    });

    it('procesa el update cuando el secreto coincide', async () => {
      const agente = await conSesion();
      const id = await handshakePendiente(agente);

      await request(servidor())
        .post('/telegram/webhook')
        .set('X-Telegram-Bot-Api-Secret-Token', SECRETO_TELEGRAM)
        .send({ callback_query: { id: '1', data: `a:${id}` } })
        .expect(200);

      expect(await estadoDe(agente, id)).toBe('aceptado');
    });
  });
});
