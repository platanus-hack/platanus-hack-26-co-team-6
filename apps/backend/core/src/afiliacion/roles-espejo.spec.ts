/**
 * `Rol` esta declarado DOS veces y las dos tienen que decir lo mismo.
 *
 *   · `auth/roles.ts::ROLES`      — el que usa el guard. Runtime.
 *   · `contracts/types.ts::Rol`   — el del contrato, espejado al front.
 *
 * Es el mismo problema que la tarea 0.7 resolvio entre core y el front, un
 * nivel mas adentro: los dos compilan perfecto por separado y divergen sin
 * que nadie se entere. Aqui la divergencia no rompe el build — rompe que un
 * `admin_organizacion` pueda invitar a un rol que el guard no conoce.
 *
 * ⚠️ ARREGLO DE VERDAD: que `auth/roles.ts` re-exporte el tipo del contrato
 *    en vez de re-declararlo. No se hace aqui porque `auth/roles.ts` es de
 *    la tarea 1.3 (Sebas) y estamos en la misma ola. Mientras tanto, este
 *    test es el que sostiene la equivalencia.
 */

import type { Rol as RolDelContrato } from '../contracts/types';
import { ROLES, esRol, type Rol as RolDeAuth } from '../auth/roles';

describe('el espejo de Rol entre auth/ y el contrato', () => {
  it('coincide en tiempo de compilacion, en los dos sentidos', () => {
    // Estas cuatro lineas no corren nada: son el test. Si los dos unions
    // dejan de ser identicos, ts-jest no compila este archivo.
    const authCabeEnContrato: RolDelContrato[] = [...ROLES];
    const contratoCabeEnAuth: RolDeAuth[] = authCabeEnContrato;
    expect(contratoCabeEnAuth).toEqual([...ROLES]);
  });

  it('son exactamente los siete de la matriz de permisos §5.2', () => {
    // Escritos a mano y no derivados de ROLES: un test que se deriva de lo
    // que prueba no prueba nada. Si aparece un octavo rol, esta lista es el
    // lugar donde alguien tiene que decidir que puede hacer.
    expect([...ROLES]).toEqual([
      'paramedico',
      'jefe_urgencias',
      'admin_organizacion',
      'regulador_crue',
      'auditor',
      'admin_plataforma',
      'servicio',
    ]);
  });

  it('esRol rechaza lo que no esta en la lista', () => {
    expect(esRol('admin_organizacion')).toBe(true);
    expect(esRol('admin')).toBe(false);
    expect(esRol('')).toBe(false);
    expect(esRol(undefined)).toBe(false);
  });
});
