/**
 * El límite de tasa de los endpoints públicos.
 *
 * Se prueba el comportamiento visible: cuántas pasan, qué IP afecta a cuál, y
 * que la ventana se reabra. Cómo se cuenta por dentro no importa.
 */

import { HttpStatus, type HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AfiliacionController,
  CUPO_VERIFICAR,
  MAXIMO_VERIFICAR_POR_MINUTO,
} from './afiliacion.controller';
import type { AfiliacionService } from './afiliacion.service';
import { LimiteTasa } from './limite-tasa';

describe('LimiteTasa', () => {
  const cupo = { maximo: 3, ventanaMs: 1_000 };

  it('deja pasar hasta el cupo y corta después', () => {
    const limite = new LimiteTasa(cupo);
    const veredictos = [1, 2, 3, 4].map(() => limite.intentar('10.0.0.1', 0));

    expect(veredictos.map((v) => v.permitido)).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(veredictos[2].restantes).toBe(0);
  });

  it('cada IP tiene su propio contador', () => {
    const limite = new LimiteTasa(cupo);
    for (let i = 0; i < 5; i++) limite.intentar('10.0.0.1', 0);

    // Que un vecino abuse no puede dejar sin afiliarse a nadie más.
    expect(limite.intentar('10.0.0.2', 0).permitido).toBe(true);
  });

  it('la ventana se reabre y dice en cuántos segundos', () => {
    const limite = new LimiteTasa(cupo);
    for (let i = 0; i < 4; i++) limite.intentar('10.0.0.1', 0);

    const bloqueado = limite.intentar('10.0.0.1', 500);
    expect(bloqueado.permitido).toBe(false);
    expect(bloqueado.reintentarEnS).toBe(1);

    expect(limite.intentar('10.0.0.1', 1_001).permitido).toBe(true);
  });
});

describe('POST /afiliacion/verificar · límite por IP', () => {
  const servicio = {
    verificar: jest.fn().mockResolvedValue({ encontrada: false }),
  } as unknown as AfiliacionService;

  const controlador = new AfiliacionController(servicio);

  const peticion = (ip: string) => ({ ip, socket: {} }) as unknown as Request;
  const respuesta = () => ({ setHeader: jest.fn() }) as unknown as Response;

  beforeEach(() => CUPO_VERIFICAR.reiniciar());

  it('la petición 21 del mismo minuto recibe 429 con Retry-After', async () => {
    const req = peticion('203.0.113.7');
    const res = respuesta();

    for (let i = 0; i < MAXIMO_VERIFICAR_POR_MINUTO; i++) {
      await controlador.verificar({ tipo: 'ips', nit: '9001234568' }, req, res);
    }

    let capturado: HttpException | undefined;
    try {
      await controlador.verificar({ tipo: 'ips', nit: '9001234568' }, req, res);
    } catch (error) {
      capturado = error as HttpException;
    }

    expect(capturado?.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Retry-After',
      expect.any(String),
    );
  });

  it('otra IP sigue pudiendo verificar', async () => {
    const res = respuesta();
    for (let i = 0; i < MAXIMO_VERIFICAR_POR_MINUTO + 1; i++) {
      try {
        await controlador.verificar(
          { tipo: 'ips', nit: '9001234568' },
          peticion('203.0.113.7'),
          res,
        );
      } catch {
        // El abusador se bloquea; lo que importa es el vecino.
      }
    }

    await expect(
      controlador.verificar(
        { tipo: 'ips', nit: '9001234568' },
        peticion('198.51.100.4'),
        res,
      ),
    ).resolves.toBeDefined();
  });
});
