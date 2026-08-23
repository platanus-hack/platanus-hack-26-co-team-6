/**
 * Tarea 1.3 — lo que el token tiene que poder responder.
 *
 * La pregunta que da sentido a todo esto es "¿quien acepto a este paciente?",
 * y estos tests la hacen de las cuatro formas en que el sistema la necesita:
 * quien es, de que organizacion, con que roles, y sobre que sedes.
 */

import { ConfigService } from '@nestjs/config';
import type { CargaAcceso, CargaRefresh } from './carga';
import { ORG_LEGADO, SesionService } from './sesion.service';
import { RegistroSesiones } from './sesiones';

const JEFE = {
  id: 'actor-1',
  organizacionId: 'org-hospital-sur',
  roles: ['jefe_urgencias' as const],
  sedes: ['1100100001'],
  tipo: 'humano' as const,
};

function montar(entorno: Record<string, string> = {}): {
  sesion: SesionService;
  registro: RegistroSesiones;
} {
  const config = {
    get: (clave: string) => entorno[clave],
  } as unknown as ConfigService;
  const registro = new RegistroSesiones();
  const sesion = new SesionService(config, registro);
  return { sesion, registro };
}

/** Lee la carga sin verificar. Solo para mirar por dentro en los tests. */
function cargaDe<T>(token: string): T {
  return JSON.parse(
    Buffer.from(token.slice(0, token.lastIndexOf('.')), 'base64url').toString(
      'utf8',
    ),
  ) as T;
}

describe('SesionService · el token lleva un actor real (1.3)', () => {
  it('firma actor, organizacion, roles y alcance', async () => {
    const { sesion } = montar({ SESION_SECRET: 'x'.repeat(32) });
    await sesion.onModuleInit();

    const { acceso } = sesion.abrirSesion(JEFE);
    const carga = cargaDe<CargaAcceso>(acceso);

    expect(carga.sub).toBe('actor-1');
    expect(carga.org).toBe('org-hospital-sur');
    expect(carga.rol).toEqual(['jefe_urgencias']);
    expect(carga.sed).toEqual(['1100100001']);
    expect(carga.sid).toBeTruthy();
  });

  it('el access expira en 15 minutos, no en 12 horas', async () => {
    const { sesion } = montar({ SESION_SECRET: 'x'.repeat(32) });
    await sesion.onModuleInit();

    const { acceso } = sesion.abrirSesion(JEFE);
    const restante = cargaDe<CargaAcceso>(acceso).exp - Date.now();

    expect(restante).toBeLessThanOrEqual(15 * 60 * 1000);
    expect(restante).toBeGreaterThan(14 * 60 * 1000);
  });

  it('un access NO sirve como refresh, ni al reves', async () => {
    // Sin el campo `typ` los dos tokens son intercambiables, y el access
    // —que viaja en cada peticion— se convertiria en una llave de 30 dias.
    const { sesion } = montar({ SESION_SECRET: 'x'.repeat(32) });
    await sesion.onModuleInit();

    const { acceso, refresco } = sesion.abrirSesion(JEFE);

    expect(sesion.verificarRefresco(acceso)).toBeNull();
    expect(sesion.verificarAcceso(refresco)).toBeNull();
  });

  it('un token con la firma cambiada no vale', async () => {
    const { sesion } = montar({ SESION_SECRET: 'x'.repeat(32) });
    await sesion.onModuleInit();

    const { acceso } = sesion.abrirSesion(JEFE);
    const [cuerpo] = acceso.split('.');

    expect(sesion.verificarAcceso(`${cuerpo}.firmainventada`)).toBeNull();
  });

  it('revocar la sesion invalida el access AL INSTANTE, sin esperar 15 min', async () => {
    // Es la razon de que exista `RegistroSesiones`: el access lleva los roles
    // adentro para no consultar la base, y el precio seria un rol revocado
    // vivo hasta 15 minutos. Esto lo cobra al instante.
    const { sesion, registro } = montar({ SESION_SECRET: 'x'.repeat(32) });
    await sesion.onModuleInit();

    const { acceso, sesionId } = sesion.abrirSesion(JEFE);
    expect(sesion.verificarAcceso(acceso)).not.toBeNull();

    registro.revocar(sesionId, 'revocacion_manual');

    expect(sesion.verificarAcceso(acceso)).toBeNull();
  });

  it('revocar por rol tumba TODAS las sesiones del actor', async () => {
    const { sesion, registro } = montar({ SESION_SECRET: 'x'.repeat(32) });
    await sesion.onModuleInit();

    const tablet = sesion.abrirSesion(JEFE);
    const escritorio = sesion.abrirSesion(JEFE);

    expect(registro.revocarDeActor(JEFE.id, 'rol_revocado')).toBe(2);
    expect(sesion.verificarAcceso(tablet.acceso)).toBeNull();
    expect(sesion.verificarAcceso(escritorio.acceso)).toBeNull();
  });
});

describe('SesionService · rotacion y reuso del refresh (1.3)', () => {
  it('rotar entrega un refresh nuevo y el anterior deja de servir', async () => {
    const { sesion } = montar({ SESION_SECRET: 'x'.repeat(32) });
    await sesion.onModuleInit();

    const inicial = sesion.abrirSesion(JEFE);
    const primera = sesion.verificarRefresco(inicial.refresco)!;
    const rotado = sesion.rotar(primera, JEFE);

    expect(rotado).not.toBeNull();
    expect(rotado!.refresco).not.toBe(inicial.refresco);

    // El viejo ya se gasto: volver a usarlo es el caso de reuso.
    expect(sesion.rotar(primera, JEFE)).toBeNull();
  });

  it('⭐ un refresh reusado revoca la CADENA COMPLETA y emite evento', async () => {
    // Alguien se llevo una copia del refresh. El legitimo y el ladron acaban
    // los dos fuera, y eso es lo correcto: la sesion se cierra y el dueño se
    // entera al siguiente request en vez de compartir su cuenta un mes.
    const { sesion, registro } = montar({ SESION_SECRET: 'x'.repeat(32) });
    await sesion.onModuleInit();

    const inicial = sesion.abrirSesion(JEFE);
    const robado = sesion.verificarRefresco(inicial.refresco)!;

    // El dueño legitimo rota primero.
    const legitimo = sesion.rotar(robado, JEFE)!;
    expect(legitimo).not.toBeNull();

    // El ladron presenta la copia del que ya se uso.
    expect(sesion.rotar(robado, JEFE)).toBeNull();

    // Y ahora el refresh del dueño legitimo tampoco sirve: cadena revocada.
    const siguiente = sesion.verificarRefresco(legitimo.refresco)!;
    expect(sesion.rotar(siguiente, JEFE)).toBeNull();
    expect(sesion.verificarAcceso(legitimo.acceso)).toBeNull();

    const eventos = registro.ultimosEventos();
    expect(eventos.some((e) => e.tipo === 'refresh_reusado')).toBe(true);
  });

  it('el refresh dura 30 dias', async () => {
    const { sesion } = montar({ SESION_SECRET: 'x'.repeat(32) });
    await sesion.onModuleInit();

    const { refresco } = sesion.abrirSesion(JEFE);
    const dias =
      (cargaDe<CargaRefresh>(refresco).exp - Date.now()) /
      (24 * 60 * 60 * 1000);

    expect(Math.round(dias)).toBe(30);
  });
});

describe('SesionService · modo legado (1.3)', () => {
  it('con PULSO_AUTH_LEGACY el demo entra como siempre, en la organizacion demo', async () => {
    const { sesion } = montar({
      SESION_SECRET: 'x'.repeat(32),
      OPERADOR_PASSWORD: 'la-del-turno',
    });
    await sesion.onModuleInit();

    expect(sesion.legadoActivo()).toBe(true);
    expect(sesion.verificarPasswordLegado('la-del-turno')).toBe(true);
    expect(sesion.verificarPasswordLegado('otra')).toBe(false);

    const { acceso } = sesion.abrirSesion(sesion.actorLegado());
    const carga = cargaDe<CargaAcceso>(acceso);

    expect(carga.org).toBe(ORG_LEGADO);
    expect(carga.rol).toContain('jefe_urgencias');
  });

  it('el actor legado se ve legado: quien audite no lo confunde con una persona', async () => {
    const { sesion } = montar({ SESION_SECRET: 'x'.repeat(32) });
    await sesion.onModuleInit();

    const { acceso } = sesion.abrirSesion(sesion.actorLegado());
    const actor = sesion.actorDeCarga(sesion.verificarAcceso(acceso)!);

    expect(actor.legado).toBe(true);
    expect(actor.id).toMatch(/^legado:/);
  });

  it('con PULSO_AUTH_LEGACY=false la puerta del turno se cierra', async () => {
    const { sesion } = montar({
      SESION_SECRET: 'x'.repeat(32),
      PULSO_AUTH_LEGACY: 'false',
    });
    await sesion.onModuleInit();

    expect(sesion.legadoActivo()).toBe(false);
  });

  it('un actor de verdad NO queda marcado como legado', async () => {
    const { sesion } = montar({ SESION_SECRET: 'x'.repeat(32) });
    await sesion.onModuleInit();

    const { acceso } = sesion.abrirSesion(JEFE);
    const actor = sesion.actorDeCarga(sesion.verificarAcceso(acceso)!);

    expect(actor.legado).toBe(false);
    expect(actor.sedes).toEqual(['1100100001']);
  });
});
