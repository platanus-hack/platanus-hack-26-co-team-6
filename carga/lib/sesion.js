/**
 * Entrar a core desde k6.
 *
 * `POST /auth/login` no devuelve el token en el cuerpo: lo pone en una cookie
 * HttpOnly (`pulso_sesion`). El valor de esa cookie ES el token firmado, y
 * `tokenDeCabeceras()` de core acepta el mismo string por
 * `Authorization: Bearer`. Por eso aqui se hace login UNA vez en `setup()`,
 * se saca el valor de la cookie y todas las peticiones viajan con Bearer:
 * el frasco de cookies de k6 es por VU y no se hereda de `setup()`.
 *
 * ⚠️ La contraseña llega SIEMPRE por variable de entorno. Nunca en la linea de
 * comandos (queda en el historial y en los logs de CI) y nunca en una URL
 * (regla 5 del repo).
 */

import http from 'k6/http';
import { fail } from 'k6';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * @returns {string} el token de sesion, listo para `Authorization: Bearer`.
 */
export function iniciarSesion(base, password, quien = 'operador') {
  if (!password) {
    fail(
      `[carga] falta la contraseña de ${quien}. Core la imprime al arrancar ` +
        'si OPERADOR_PASSWORD no esta puesta. Pasala en CARGA_PASSWORD.',
    );
  }

  const res = http.post(`${base}/auth/login`, JSON.stringify({ password }), {
    headers: JSON_HEADERS,
    tags: { etapa: 'login' },
  });

  if (res.status !== 200) {
    fail(
      `[carga] login de ${quien} devolvio ${res.status}. ` +
        'Sin sesion no hay prueba: todas las rutas de core responden 401.',
    );
  }

  const galleta = res.cookies['pulso_sesion'];
  if (!galleta || !galleta.length || !galleta[0].value) {
    fail(
      '[carga] el login no dejo la cookie pulso_sesion. ' +
        'Cambio el nombre de la cookie en core? Ver auth/sesion.service.ts.',
    );
  }
  return galleta[0].value;
}

/** Cabeceras + etiqueta de etapa para una peticion autenticada con cuerpo. */
export function conSesion(token, etapa, extra = {}) {
  return {
    headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}`, ...extra },
    tags: { etapa },
  };
}
