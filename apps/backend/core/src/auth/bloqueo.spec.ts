/**
 * Tarea 1.3, paso 7 — bloqueo progresivo.
 *
 * Los dos ejes existen por ataques distintos y hay un test por cada uno.
 */

import { BloqueoLogin } from './bloqueo';

describe('BloqueoLogin', () => {
  it('deja pasar mientras no haya fallos', () => {
    expect(new BloqueoLogin().esperaRestanteS('jefe@sur.co', '10.0.0.1')).toBe(
      0,
    );
  });

  it('a los 5 fallos hace esperar, y a los 10 hace esperar mucho mas', () => {
    const bloqueo = new BloqueoLogin();

    for (let i = 0; i < 4; i += 1)
      bloqueo.registrarFallo('jefe@sur.co', '10.0.0.1');
    expect(bloqueo.esperaRestanteS('jefe@sur.co', '10.0.0.1')).toBe(0);

    bloqueo.registrarFallo('jefe@sur.co', '10.0.0.1');
    const corta = bloqueo.esperaRestanteS('jefe@sur.co', '10.0.0.1');
    expect(corta).toBeGreaterThan(0);

    for (let i = 0; i < 5; i += 1)
      bloqueo.registrarFallo('jefe@sur.co', '10.0.0.1');
    expect(bloqueo.esperaRestanteS('jefe@sur.co', '10.0.0.1')).toBeGreaterThan(
      corta,
    );
  });

  it('bloquea por IP aunque cada intento use una cuenta distinta', () => {
    // *Password spraying*: una contraseña comun contra mil cuentas. Sin el eje
    // de IP, ninguna cuenta acumula fallos y nadie se bloquea nunca.
    const bloqueo = new BloqueoLogin();
    for (let i = 0; i < 5; i += 1)
      bloqueo.registrarFallo(`persona${i}@sur.co`, '10.0.0.9');

    expect(bloqueo.esperaRestanteS('otra@sur.co', '10.0.0.9')).toBeGreaterThan(
      0,
    );
  });

  it('bloquea la cuenta aunque los intentos vengan de IP distintas', () => {
    const bloqueo = new BloqueoLogin();
    for (let i = 0; i < 5; i += 1)
      bloqueo.registrarFallo('jefe@sur.co', `10.0.0.${i}`);

    expect(bloqueo.esperaRestanteS('jefe@sur.co', '10.0.9.9')).toBeGreaterThan(
      0,
    );
  });

  it('un login bueno limpia la cuenta pero NO la IP', () => {
    // Si limpiara la IP, quien ataca desde un sitio con una cuenta propia
    // valida se destrabaria solo entre tanda y tanda.
    const bloqueo = new BloqueoLogin();
    for (let i = 0; i < 5; i += 1)
      bloqueo.registrarFallo('jefe@sur.co', '10.0.0.1');

    bloqueo.registrarExito('jefe@sur.co');

    expect(bloqueo.esperaRestanteS('jefe@sur.co', '10.0.0.2')).toBe(0);
    expect(bloqueo.esperaRestanteS('jefe@sur.co', '10.0.0.1')).toBeGreaterThan(
      0,
    );
  });
});
