/**
 * Tarea 2.1 — «rate limit por IP (es endpoint publico)».
 *
 * Se prueba la ventana deslizante con reloj inyectado. Dormir 60 s en un
 * test es la forma mas rapida de que alguien lo marque como `skip`.
 */

import { Logger } from '@nestjs/common';
import { PulsoError } from '../common/pulso-error.filter';
import { LIMITE_POR_VENTANA, LimiteIp, VENTANA_MS } from './limite-ip';

let limite: LimiteIp;

beforeAll(() =>
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined),
);
afterAll(() => jest.restoreAllMocks());
beforeEach(() => (limite = new LimiteIp()));

describe('LimiteIp', () => {
  it('deja pasar hasta el limite y niega el siguiente', () => {
    const t = 1_000_000;
    for (let i = 0; i < LIMITE_POR_VENTANA; i++) {
      expect(() => limite.exigir('cliente', t + i)).not.toThrow();
    }
    expect(() => limite.exigir('cliente', t + LIMITE_POR_VENTANA)).toThrow(
      PulsoError,
    );
  });

  it('responde 429 y dice cuanto esperar', () => {
    const t = 1_000_000;
    for (let i = 0; i < LIMITE_POR_VENTANA; i++) limite.exigir('cliente', t);
    try {
      limite.exigir('cliente', t + 10_000);
      fail('deberia haber reventado');
    } catch (e) {
      const error = e as PulsoError;
      expect(error.code).toBe('PULSO_RATE_LIMITED');
      expect(error.estado).toBe(429);
      // Reintentable: es un «ahora no», no un error de quien llama.
      expect(error.retryable).toBe(true);
      expect(error.message).toMatch(/\d+ s/);
      expect(error.details).toMatchObject({ esperaS: 50 });
    }
  });

  it('la ventana desliza, y solo libera los golpes que de verdad vencieron', () => {
    // Con un contador que se reinicia en punto, entre el ultimo golpe de un
    // minuto y el primero del siguiente pasaria el DOBLE del limite. Con
    // ventana deslizante, cada golpe libera su cupo en su propio aniversario.
    const t = 1_000_000;
    const mitad = LIMITE_POR_VENTANA / 2;

    // Mitad de los golpes al principio, mitad medio minuto despues.
    for (let i = 0; i < mitad; i++) limite.exigir('cliente', t);
    for (let i = 0; i < mitad; i++)
      limite.exigir('cliente', t + VENTANA_MS / 2);
    expect(() => limite.exigir('cliente', t + VENTANA_MS / 2)).toThrow();

    // Un instante ANTES de que venza el primer bloque siguen contando los 20.
    expect(() => limite.exigir('cliente', t + VENTANA_MS - 1)).toThrow();

    // Al vencer el primer bloque se liberan exactamente esos cupos: entran
    // `mitad` golpes nuevos y el siguiente vuelve a chocar.
    const despues = t + VENTANA_MS;
    for (let i = 0; i < mitad; i++) {
      expect(() => limite.exigir('cliente', despues)).not.toThrow();
    }
    expect(() => limite.exigir('cliente', despues)).toThrow();
  });

  it('cada cliente lleva su propia cuenta', () => {
    const t = 1_000_000;
    for (let i = 0; i < LIMITE_POR_VENTANA; i++) limite.exigir('uno', t);
    expect(() => limite.exigir('uno', t)).toThrow();
    expect(() => limite.exigir('otro', t)).not.toThrow();
  });

  it('no pone la clave del cliente en el mensaje de error', () => {
    // La clave es un hash de la IP, pero igual: lo que no se filtra no se
    // filtra. El mensaje lo lee un humano que no necesita saber quien fue.
    const t = 1_000_000;
    for (let i = 0; i < LIMITE_POR_VENTANA; i++)
      limite.exigir('clave-secreta', t);
    try {
      limite.exigir('clave-secreta', t);
      fail('deberia haber reventado');
    } catch (e) {
      expect((e as PulsoError).message).not.toContain('clave-secreta');
      expect(JSON.stringify((e as PulsoError).details)).not.toContain(
        'clave-secreta',
      );
    }
  });
});
