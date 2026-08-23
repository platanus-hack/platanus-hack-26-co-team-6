/**
 * Token de servicio (tarea 1.8).
 *
 * Lo que se prueba es comportamiento observable: qué puede y qué no puede un
 * token de `voz`, y qué pasa cuando se rota el secreto con tokens vivos.
 */

import { ConfigService } from '@nestjs/config';
import { SesionService } from './sesion.service';
import { ALCANCE_VOZ, alcanceDeRuta } from './token-servicio';

/** ConfigService de mentira: un diccionario. Lo mismo que lee de .env. */
function servicio(valores: Record<string, string> = {}): SesionService {
  const s = new SesionService({
    get: (clave: string) => valores[clave],
  } as unknown as ConfigService);
  s.onModuleInit();
  return s;
}

function cargaDe(token: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(token.slice(0, token.lastIndexOf('.')), 'base64url').toString(
      'utf8',
    ),
  ) as Record<string, unknown>;
}

const SECRETO = 'secreto-de-pruebas-largo-1';
const SECRETO_NUEVO = 'secreto-de-pruebas-largo-2';

describe('SesionService.emitirServicio', () => {
  it('emite un token con sub svc:voz y el alcance pedido', () => {
    const s = servicio({ SESION_SECRET: SECRETO });

    const { token, sub, alcance, expiraEn } = s.emitirServicio(
      'voz',
      ALCANCE_VOZ,
    );

    expect(sub).toBe('svc:voz');
    expect(alcance).toEqual(['caso:crear', 'caso:leer', 'notificar']);
    // 24 h, como dice el doc §3.1. Con holgura de un minuto por el reloj.
    expect(expiraEn - Date.now()).toBeGreaterThan(23.9 * 3600 * 1000);
    expect(expiraEn - Date.now()).toBeLessThanOrEqual(24 * 3600 * 1000);

    const carga = s.verificar(token);
    expect(carga?.sub).toBe('svc:voz');
    expect(carga?.tip).toBe('servicio');
    expect(carga?.alc).toEqual(ALCANCE_VOZ);
  });

  it('el alcance de voz NO incluye aceptar traslados ni declarar capacidad', () => {
    // Es el corazón de la tarea: un webhook de WhatsApp no puede tener la
    // llave de una decisión clínica.
    expect(ALCANCE_VOZ).not.toContain('handshake:responder');
    expect(ALCANCE_VOZ).not.toContain('capacidad:declarar');
  });

  it('rechaza un alcance que no existe en vez de emitirlo', () => {
    const s = servicio({ SESION_SECRET: SECRETO });
    expect(() =>
      // @ts-expect-error a propósito: esto es lo que llegaría por un curl.
      s.emitirServicio('voz', ['caso:crea']),
    ).toThrow(/desconocido/i);
  });

  it('rechaza un alcance vacío', () => {
    const s = servicio({ SESION_SECRET: SECRETO });
    expect(() => s.emitirServicio('voz', [])).toThrow(/alcance/i);
  });

  it('rechaza nombres de servicio que ensuciarían la auditoría', () => {
    const s = servicio({ SESION_SECRET: SECRETO });
    for (const malo of ['Voz', 'voz voz', 'voz\n', '', 'señal']) {
      expect(() => s.emitirServicio(malo, ALCANCE_VOZ)).toThrow(/inválido/i);
    }
  });

  it('un token humano no puede hacerse pasar por servicio', () => {
    const s = servicio({ SESION_SECRET: SECRETO });
    expect(() => s.emitir('svc:voz')).toThrow(/servicio/i);

    const carga = s.verificar(s.emitir().token);
    expect(carga?.tip).toBe('humano');
    expect(carga?.alc).toBeUndefined();
  });

  it('no se puede agregar un alcance editando la carga: la firma no cuadra', () => {
    const s = servicio({ SESION_SECRET: SECRETO });
    const { token } = s.emitirServicio('voz', ALCANCE_VOZ);

    const carga = cargaDe(token);
    carga.alc = [...ALCANCE_VOZ, 'handshake:responder'];
    const falsificado = `${Buffer.from(JSON.stringify(carga)).toString(
      'base64url',
    )}.${token.slice(token.lastIndexOf('.') + 1)}`;

    expect(s.verificar(falsificado)).toBeNull();
  });

  it('un token de servicio con el alcance corrupto se rechaza entero', () => {
    // Firmado de verdad pero con basura adentro: solo puede venir de un bug
    // nuestro. Que falle al entrar y no ruta por ruta.
    const s = servicio({ SESION_SECRET: SECRETO });
    const { token } = s.emitirServicio('voz', ALCANCE_VOZ);

    const carga = cargaDe(token);
    carga.alc = ['inventado'];
    // Se re-firma con el MISMO secreto del servicio: la firma sí cuadra.
    const cargaB64 = Buffer.from(JSON.stringify(carga)).toString('base64url');
    const firmar = (s as unknown as { firmar: (c: string) => string }).firmar;
    const reFirmado = `${cargaB64}.${firmar.call(s, cargaB64)}`;

    expect(s.verificar(reFirmado)).toBeNull();
  });
});

describe('credencial de plataforma (POST /auth/servicio)', () => {
  it('sin PULSO_ADMIN_TOKEN nadie puede emitir: niega por defecto', () => {
    const s = servicio({ SESION_SECRET: SECRETO });
    expect(s.emisionDeServicioHabilitada()).toBe(false);
    expect(s.verificarAdminPlataforma('lo-que-sea')).toBe(false);
    expect(s.verificarAdminPlataforma('')).toBe(false);
    expect(s.verificarAdminPlataforma(undefined)).toBe(false);
  });

  it('con PULSO_ADMIN_TOKEN solo pasa el valor exacto', () => {
    const s = servicio({
      SESION_SECRET: SECRETO,
      PULSO_ADMIN_TOKEN: 'credencial-de-plataforma-1',
    });
    expect(s.emisionDeServicioHabilitada()).toBe(true);
    expect(s.verificarAdminPlataforma('credencial-de-plataforma-1')).toBe(true);
    expect(s.verificarAdminPlataforma('credencial-de-plataforma-2')).toBe(
      false,
    );
  });

  it('una credencial corta no habilita nada (no es una contraseña de turno)', () => {
    const s = servicio({ SESION_SECRET: SECRETO, PULSO_ADMIN_TOKEN: 'corta' });
    expect(s.emisionDeServicioHabilitada()).toBe(false);
    expect(s.verificarAdminPlataforma('corta')).toBe(false);
  });
});

describe('rotación del secreto con tokens vivos', () => {
  it('rotar sin ventana de gracia invalida en seco lo ya emitido', () => {
    const viejo = servicio({ SESION_SECRET: SECRETO });
    const { token } = viejo.emitirServicio('voz', ALCANCE_VOZ);

    const rotado = servicio({ SESION_SECRET: SECRETO_NUEVO });
    expect(rotado.verificar(token)).toBeNull();
  });

  it('con SESION_SECRET_ANTERIOR el token vivo sigue entrando', () => {
    // Es el escenario real: se rota la variable en Render y `voz` todavía
    // lleva en memoria el token firmado con el secreto de ayer.
    const viejo = servicio({ SESION_SECRET: SECRETO });
    const { token } = viejo.emitirServicio('voz', ALCANCE_VOZ);

    const rotado = servicio({
      SESION_SECRET: SECRETO_NUEVO,
      SESION_SECRET_ANTERIOR: SECRETO,
    });

    expect(rotado.verificar(token)?.sub).toBe('svc:voz');
    // Y lo que emite desde ahora va firmado con el NUEVO, no con el viejo.
    const { token: fresco } = rotado.emitirServicio('voz', ALCANCE_VOZ);
    expect(viejo.verificar(fresco)).toBeNull();
  });

  it('acepta también el nombre PULSO_SECRETO_ANTERIOR', () => {
    const viejo = servicio({ SESION_SECRET: SECRETO });
    const { token } = viejo.emitirServicio('voz', ALCANCE_VOZ);

    const rotado = servicio({
      SESION_SECRET: SECRETO_NUEVO,
      PULSO_SECRETO_ANTERIOR: SECRETO,
    });
    expect(rotado.verificar(token)?.sub).toBe('svc:voz');
  });

  it('la ventana es una ventana: pasadas las horas, el viejo deja de valer', () => {
    const viejo = servicio({ SESION_SECRET: SECRETO });
    const { token } = viejo.emitirServicio('voz', ALCANCE_VOZ);

    const rotado = servicio({
      SESION_SECRET: SECRETO_NUEVO,
      SESION_SECRET_ANTERIOR: SECRETO,
      PULSO_SECRETO_ANTERIOR_HORAS: '1',
    });
    expect(rotado.verificar(token)).not.toBeNull();

    // Dos horas después el token todavía no expiró (vive 24 h), pero la
    // gracia sí: la ventana no puede volverse permanente por olvido.
    const ahora = Date.now();
    const reloj = jest.spyOn(Date, 'now').mockReturnValue(ahora + 2 * 3600_000);
    try {
      expect(rotado.verificar(token)).toBeNull();
    } finally {
      reloj.mockRestore();
    }
  });
});

describe('tabla de rutas → alcance', () => {
  it('mapea lo que voz necesita', () => {
    expect(alcanceDeRuta('POST', '/triage')).toBe('caso:crear');
    expect(alcanceDeRuta('POST', '/match')).toBe('caso:leer');
    expect(alcanceDeRuta('GET', '/estado')).toBe('caso:leer');
    expect(alcanceDeRuta('POST', '/dispatch')).toBe('notificar');
  });

  it('lo que no está declarado no tiene alcance (y el guard niega)', () => {
    expect(alcanceDeRuta('POST', '/voz/transcribir')).toBeUndefined();
    expect(alcanceDeRuta('GET', '/capacidades')).toBeUndefined();
    expect(alcanceDeRuta('POST', '/ruta-que-nadie-escribio')).toBeUndefined();
  });

  it('handshake/respond exige un alcance que voz no tiene', () => {
    const requerido = alcanceDeRuta('POST', '/handshake/respond');
    expect(requerido).toBe('handshake:responder');
    expect(ALCANCE_VOZ).not.toContain(requerido);
  });

  it('la barra final y el método en minúscula no cambian la respuesta', () => {
    expect(alcanceDeRuta('post', '/triage/')).toBe('caso:crear');
  });
});
