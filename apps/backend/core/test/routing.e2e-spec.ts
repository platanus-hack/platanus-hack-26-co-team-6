import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('routing HTTP contract (e2e)', () => {
  let app: INestApplication<App>;
  beforeEach(async () => {
    process.env.ROUTING_STORE = 'memory';
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    await app.init();
  });
  afterEach(async () => app.close());

  it('returns the PULSO invalid-input envelope for malformed triage', () =>
    request(app.getHttpServer())
      .post('/triage')
      .send({ texto: '' })
      .expect(400)
      .expect({
        error: {
          code: 'PULSO_INVALID_INPUT',
          message: 'Invalid request',
          retryable: false,
        },
      }));

  it('holds low-confidence triage before matching', () =>
    request(app.getHttpServer())
      .post('/match')
      .send({
        caso: {
          id: 'review-case',
          textoCrudo: 'patient report',
          resumen: 'symptoms',
          triage: 1,
          dxCie10: 'I21.1',
          dxDescripcion: 'acute infarction',
          serviciosRequeridos: [743],
          complejidadRequerida: 'alta',
          edad: 60,
          sexo: 'M',
          signosAlarma: ['pain'],
          requiereMedicoABordo: true,
          confianza: 0.2,
          origen: { lat: 4.6, lng: -74.1 },
          tipoMovil: 'TAM',
          creadoEn: '2026-01-01T00:00:00.000Z',
        },
      })
      .expect(400)
      .expect({
        error: {
          code: 'PULSO_LOW_CONFIDENCE',
          message: 'Clinical review is required before matching',
          retryable: false,
        },
      }));

  it('blocks dispatch without recorded decision evidence', () =>
    request(app.getHttpServer())
      .post('/dispatch')
      .send({ casoId: 'case-1', sedeCodigo: 'DEST-1' })
      .expect(400)
      .expect({
        error: {
          code: 'PULSO_INCOMPLETE_EVIDENCE',
          message: 'Complete matching evidence is required before dispatch',
          retryable: false,
        },
      }));
});
