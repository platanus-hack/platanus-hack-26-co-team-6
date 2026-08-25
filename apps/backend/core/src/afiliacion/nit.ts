/**
 * Normalizacion del NIT — tareas 2.1 y 2.9.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  EL DIGITO DE VERIFICACION
 * ═══════════════════════════════════════════════════════════════════
 *  Un NIT colombiano se escribe de cuatro formas y las cuatro son la misma
 *  entidad:
 *
 *      900123456        900.123.456        900123456-1      900.123.456-1
 *
 *  El `-1` del final es el digito de verificacion (DV): se CALCULA a partir
 *  de los otros, no es informacion nueva. La DIAN lo pide en unos formularios
 *  y no en otros, y el RUES lo muestra pegado.
 *
 *  Comparar «todos los digitos» los trata como dos NIT distintos. Eso no es
 *  un detalle cosmetico: la unicidad de la afiliacion es `(tipo, nit)`, asi
 *  que la misma clinica se afiliaria dos veces —una escribiendo el DV y otra
 *  no— y terminaria con dos organizaciones, dos admins y dos estados. La
 *  suspension de una no apagaria a la otra.
 *
 *  Por eso se guarda y se compara SIEMPRE la base, sin DV.
 */

/**
 * La base del NIT: digitos, sin puntos y sin digito de verificacion.
 *
 * Reglas, en orden:
 *   1. Si hay guion, lo de antes es la base. Es explicito y gana siempre.
 *   2. Sin guion, 10 digitos se leen como 9 + DV. Los NIT de persona
 *      juridica en Colombia son de 9 digitos (empiezan en 8 o 9).
 *   3. Cualquier otro largo se deja tal cual: no se adivina.
 */
export function normalizarNit(valor: string | undefined): string {
  const crudo = (valor ?? '').trim();
  if (!crudo) return '';

  const guion = crudo.indexOf('-');
  if (guion > 0) return soloDigitos(crudo.slice(0, guion));

  const digitos = soloDigitos(crudo);
  return digitos.length === 10 ? digitos.slice(0, 9) : digitos;
}

/** ¿Son el mismo NIT escrito de dos formas? */
export const nitsEquivalentes = (a: string, b: string): boolean => {
  const na = normalizarNit(a);
  return na !== '' && na === normalizarNit(b);
};

const soloDigitos = (valor: string): string => valor.replace(/\D/g, '');
