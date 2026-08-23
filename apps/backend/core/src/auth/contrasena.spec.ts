/**
 * Tarea 1.3, paso 2 — contraseñas de personas.
 *
 * Lo que se prueba no es "usa scrypt": es que dos personas con la misma
 * contraseña no compartan hash, que un hash no sirva para adivinar la clave,
 * y que un formato desconocido no deje pasar a nadie.
 */

import {
  LARGO_MINIMO,
  algoritmoActivo,
  hashear,
  requiereRehash,
  verificar,
} from './contrasena';

describe('contrasena', () => {
  it('el hash no contiene la contraseña', async () => {
    const hash = await hashear('contraseña-de-turno-larga');
    expect(hash).not.toContain('contraseña-de-turno-larga');
  });

  it('la misma clave hasheada dos veces da hashes distintos', async () => {
    // Es la sal. Sin ella, una tabla precomputada rompe todas las cuentas que
    // comparten contraseña de una sola vez — que era el problema de sha256.
    const a = await hashear('la misma clave de siempre');
    const b = await hashear('la misma clave de siempre');
    expect(a).not.toBe(b);
    expect(await verificar('la misma clave de siempre', a)).toBe(true);
    expect(await verificar('la misma clave de siempre', b)).toBe(true);
  });

  it('rechaza la clave equivocada', async () => {
    const hash = await hashear('jefe-urgencias-2026');
    expect(await verificar('jefe-urgencias-2027', hash)).toBe(false);
    expect(await verificar('', hash)).toBe(false);
  });

  it('exige el minimo de caracteres', async () => {
    await expect(hashear('corta')).rejects.toThrow(String(LARGO_MINIMO));
  });

  it('un hash corrupto o de formato desconocido es un `false`, no una excepcion', async () => {
    // Un 500 aqui le dice a quien prueba que esa cuenta existe y esta rota.
    expect(await verificar('lo que sea', 'no-es-un-hash')).toBe(false);
    expect(await verificar('lo que sea', '$scrypt$roto')).toBe(false);
    expect(await verificar('lo que sea', '')).toBe(false);
  });

  it('NO valida un hash de argon2 con otro algoritmo cuando argon2 no esta', async () => {
    // Prefiero un login que falla y se ve, a uno que valida con algo mas
    // debil de lo que el hash declara.
    const hashArgon = '$argon2id$v=19$m=65536,t=3,p=4$c2FsMTIzNDU2Nzg$deadbeef';
    if ((await algoritmoActivo()) === 'scrypt') {
      expect(await verificar('lo que sea', hashArgon)).toBe(false);
    }
  });

  it('un hash recien creado nunca pide rehash', async () => {
    expect(await requiereRehash(await hashear('una contraseña valida'))).toBe(
      false,
    );
  });

  it('un hash de scrypt pide rehash exactamente cuando argon2 esta disponible', async () => {
    // Es lo que hace que instalar argon2 migre las contraseñas solas, login a
    // login, sin pedirle nada a nadie ni tocar una migracion.
    const viejo = await hashear('una contraseña valida');
    expect(await requiereRehash(viejo)).toBe(
      (await algoritmoActivo()) === 'argon2id' && !viejo.startsWith('$argon2'),
    );
  });
});
