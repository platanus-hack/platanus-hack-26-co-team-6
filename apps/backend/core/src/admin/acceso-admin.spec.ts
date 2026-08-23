/**
 * Quien administra la plataforma. La decision de autorizacion, aislada.
 *
 * El checklist de 5.11 pide una cosa concreta: `admin_organizacion` → 403.
 * Aqui esta probada en los dos mundos — el de hoy (sin roles) y el que trae
 * la tarea 1.3 (con roles) — porque el modo de fallo peligroso es justamente
 * que la regla valga en uno y no en el otro.
 */

import { decidirAcceso, identidadReal, type HechosAcceso } from './acceso-admin';

/** Mundo de hoy: token humano sin roles y con el puente configurado. */
const HOY: HechosAcceso = {
  carga: { sub: 'operador', tip: 'humano' },
  plataformaConfigurada: true,
  tokenPlataformaPresente: true,
  tokenPlataformaValido: true,
};

describe('nunca permisivo por defecto', () => {
  it('sin sesion, niega', () => {
    const a = decidirAcceso({ ...HOY, carga: null });
    expect(a.permitido).toBe(false);
    if (a.permitido) return;
    expect(a.motivo).toBe('sin-sesion');
  });

  it('sin PULSO_ADMIN_TOKEN la puerta no existe, no queda abierta', () => {
    // Es la excepcion escrita en AGENTS.md a la regla de degradacion: en
    // autenticacion, un fallback abierto ES la vulnerabilidad.
    const a = decidirAcceso({
      ...HOY,
      plataformaConfigurada: false,
      tokenPlataformaPresente: false,
      tokenPlataformaValido: false,
    });
    expect(a.permitido).toBe(false);
    if (a.permitido) return;
    expect(a.motivo).toBe('plataforma-sin-credencial');
    expect(a.mensaje).toMatch(/PULSO_ADMIN_TOKEN/);
  });

  it('credencial equivocada, niega', () => {
    const a = decidirAcceso({ ...HOY, tokenPlataformaValido: false });
    expect(a.permitido).toBe(false);
    if (a.permitido) return;
    expect(a.motivo).toBe('credencial-de-plataforma-invalida');
  });

  it('un token de servicio no administra logica clinica', () => {
    // `voz` puede crear un caso. No puede cambiar que exige un infarto.
    const a = decidirAcceso({
      ...HOY,
      carga: { sub: 'svc:voz', tip: 'servicio', roles: ['admin_plataforma'] },
    });
    expect(a.permitido).toBe(false);
    if (a.permitido) return;
    expect(a.motivo).toBe('identidad-de-servicio');
  });
});

describe('el puente provisional de hoy', () => {
  it('con la credencial de plataforma, entra y queda registrado como puente', () => {
    const a = decidirAcceso(HOY);
    expect(a.permitido).toBe(true);
    if (!a.permitido) return;
    expect(a.via).toBe('puente-token-plataforma');
    expect(a.actor).toBe('operador');
  });

  it('sin la cabecera, niega y lo explica', () => {
    const a = decidirAcceso({
      ...HOY,
      tokenPlataformaPresente: false,
      tokenPlataformaValido: false,
    });
    expect(a.permitido).toBe(false);
    if (a.permitido) return;
    expect(a.motivo).toBe('sin-credencial-de-plataforma');
    expect(a.mensaje).toMatch(/1\.3/);
  });
});

describe('cuando llegue 1.3, mandan los roles', () => {
  it('admin_plataforma entra por rol', () => {
    const a = decidirAcceso({
      ...HOY,
      carga: { sub: 'act_7', tip: 'humano', roles: ['admin_plataforma'] },
      // Y ya no necesita la credencial del puente.
      tokenPlataformaPresente: false,
      tokenPlataformaValido: false,
    });
    expect(a.permitido).toBe(true);
    if (!a.permitido) return;
    expect(a.via).toBe('rol');
    expect(a.actor).toBe('act_7');
  });

  it('admin_organizacion recibe 403 — el checklist de 5.11', () => {
    const a = decidirAcceso({
      ...HOY,
      carga: { sub: 'act_9', tip: 'humano', roles: ['admin_organizacion'] },
    });
    expect(a.permitido).toBe(false);
    if (a.permitido) return;
    expect(a.motivo).toBe('sin-rol-admin');
  });

  it('un rol equivocado NO se salva con la credencial de plataforma', () => {
    // Si el puente ganara sobre los roles, una variable de entorno compartida
    // seria una escalada de privilegios para cualquiera que la conociera.
    const a = decidirAcceso({
      carga: { sub: 'act_9', tip: 'humano', roles: ['admin_organizacion'] },
      plataformaConfigurada: true,
      tokenPlataformaPresente: true,
      tokenPlataformaValido: true,
    });
    expect(a.permitido).toBe(false);
    if (a.permitido) return;
    expect(a.motivo).toBe('sin-rol-admin');
  });

  it('roles vacios es una respuesta, y la respuesta es no', () => {
    const a = decidirAcceso({ ...HOY, carga: { sub: 'act_9', roles: [] } });
    expect(a.permitido).toBe(false);
    if (a.permitido) return;
    expect(a.motivo).toBe('sin-rol-admin');
  });
});

describe('identidadReal', () => {
  it('dice si core ya emite roles, para que la consola lo cuente', () => {
    expect(identidadReal({ sub: 'operador' })).toBe(false);
    expect(identidadReal({ sub: 'act_7', roles: [] })).toBe(true);
    expect(identidadReal(null)).toBe(false);
  });
});
