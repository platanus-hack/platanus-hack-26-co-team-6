/**
 * Tarea 5.9 — llaves de API con alcance.
 *
 * Lo que se prueba es lo que le pasa al integrador: que su llave solo haga lo
 * suyo, que rotarla no le tumbe el servicio, y que el valor no se pueda
 * recuperar de ninguna parte.
 */

import { GRACIA_MS, LlavesService, PREFIJO } from './llaves';

const CREAR = {
  organizacionId: 'org-sur',
  etiqueta: 'HIS del Hospital del Sur',
  alcances: ['caso:leer' as const],
  creadaPor: 'actor-admin',
};

describe('LlavesService', () => {
  it('la llave lleva el prefijo que detectan los escaneres de secretos', () => {
    // No es cosmetico: es lo que hace que GitHub avise si alguien la commitea.
    const { valor } = new LlavesService().crear(CREAR);
    expect(valor.startsWith(PREFIJO)).toBe(true);
    expect(valor.length).toBeGreaterThan(PREFIJO.length + 30);
  });

  it('dos llaves nunca salen iguales', () => {
    const servicio = new LlavesService();
    expect(servicio.crear(CREAR).valor).not.toBe(servicio.crear(CREAR).valor);
  });

  it('el valor NO queda guardado: solo su hash y los ultimos 4', () => {
    const servicio = new LlavesService();
    const { llave, valor } = servicio.crear(CREAR);

    expect(llave.hash).not.toContain(valor);
    expect(JSON.stringify(servicio.porId(llave.id))).not.toContain(valor);
    expect(valor.endsWith(llave.ultimos4)).toBe(true);
  });

  it('verifica la llave correcta y rechaza cualquier otra', () => {
    const servicio = new LlavesService();
    const { valor } = servicio.crear(CREAR);

    expect(servicio.verificar(valor).valida).toBe(true);
    expect(servicio.verificar(`${PREFIJO}inventada`)).toEqual({
      valida: false,
      motivo: 'desconocida',
    });
  });

  it('registra el uso: es lo que permite notar una llave filtrada', () => {
    const servicio = new LlavesService();
    const { llave, valor } = servicio.crear(CREAR);

    servicio.verificar(valor, '190.0.0.7');
    servicio.verificar(valor, '190.0.0.7');

    const despues = servicio.porId(llave.id)!;
    expect(despues.usos).toBe(2);
    expect(despues.ultimaIp).toBe('190.0.0.7');
    expect(despues.ultimoUsoEn).not.toBeNull();
  });

  it('revocar surte efecto de inmediato', () => {
    const servicio = new LlavesService();
    const { llave, valor } = servicio.crear(CREAR);

    expect(servicio.revocar(llave.id)).toBe(true);
    expect(servicio.verificar(valor)).toEqual({
      valida: false,
      motivo: 'revocada',
    });
  });

  it('⭐ rotar NO tumba al integrador: la vieja sirve 24 h mas', () => {
    // Revocarla en el acto convierte "rotar llaves" en algo que nadie quiere
    // hacer, porque el corte lo causa el boton que apretamos nosotros.
    const servicio = new LlavesService();
    const { llave, valor: vieja } = servicio.crear(CREAR);

    const rotada = servicio.rotar(llave.id, 'actor-admin')!;

    expect(rotada.valor).not.toBe(vieja);
    expect(servicio.verificar(vieja).valida).toBe(true);
    expect(servicio.verificar(rotada.valor).valida).toBe(true);
    // Y hereda el alcance: rotar no es reconfigurar.
    expect(rotada.llave.alcances).toEqual(llave.alcances);
  });

  it('pasada la gracia, la llave vieja deja de servir', () => {
    jest.useFakeTimers();
    try {
      const servicio = new LlavesService();
      const { llave, valor: vieja } = servicio.crear(CREAR);
      const rotada = servicio.rotar(llave.id, 'actor-admin')!;

      jest.advanceTimersByTime(GRACIA_MS + 1000);

      expect(servicio.verificar(vieja)).toEqual({
        valida: false,
        motivo: 'expirada',
      });
      expect(servicio.verificar(rotada.valor).valida).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('una llave revocada no se puede rotar', () => {
    const servicio = new LlavesService();
    const { llave } = servicio.crear(CREAR);
    servicio.revocar(llave.id);

    expect(servicio.rotar(llave.id, 'actor-admin')).toBeNull();
  });

  it('minimo por defecto: sin alcances pedidos, la llave no puede nada', () => {
    const servicio = new LlavesService();
    const { llave } = servicio.crear({ ...CREAR, alcances: [] });
    expect(llave.alcances).toEqual([]);
  });

  it('descarta alcances inventados en vez de guardarlos', () => {
    const servicio = new LlavesService();
    const { llave } = servicio.crear({
      ...CREAR,
      alcances: ['caso:leer', 'todo:hacer'] as never,
    });
    expect(llave.alcances).toEqual(['caso:leer']);
  });

  it('listar devuelve solo las de esa organizacion', () => {
    const servicio = new LlavesService();
    servicio.crear(CREAR);
    servicio.crear({ ...CREAR, organizacionId: 'org-norte' });

    expect(servicio.listar('org-sur')).toHaveLength(1);
    expect(servicio.listar('org-norte')).toHaveLength(1);
    expect(servicio.listar('org-que-no-existe')).toHaveLength(0);
  });
});
