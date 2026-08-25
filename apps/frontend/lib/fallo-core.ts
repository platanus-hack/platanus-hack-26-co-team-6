/**
 * Traducir un fallo de core a algo que se pueda leer y actuar.
 *
 * Vive fuera de los componentes para poder probarse sin React: es exactamente
 * la parte que se equivocó —todo se pintaba como "Core no responde"— y la que
 * no puede volver a equivocarse en silencio.
 *
 * Lo usan `/admin` y `/equipo`, y debería usarlo cualquier consola nueva: cada
 * una tenía su propio `catch` y las dos cometían el mismo error, porque el
 * error no estaba en ninguna de las dos sino en no tener esto.
 */

// `import type` y no un import de verdad: igual que `lib/api.ts`, este archivo
// se queda sin imports en tiempo de ejecución para que `node --test` pueda
// cargarlo con solo borrar los tipos, sin runner ni bundler.
import type { ErrorApi } from "./api";

/**
 * ¿Es un error de core con status, o algo que ni llegó a serlo?
 *
 * Se mira la forma y no `instanceof`: el error viaja desde otro módulo y una
 * comprobación estructural no depende de que ambos hayan cargado la MISMA
 * copia de la clase.
 */
function esErrorApi(e: unknown): e is ErrorApi {
  return (
    e instanceof Error &&
    e.name === "ErrorApi" &&
    typeof (e as ErrorApi).status === "number"
  );
}

/**
 * Por qué una petición a core no trajo respuesta útil.
 *
 * Existe porque durante un rato todo esto se pintó igual —"Core no
 * responde"— y esa pantalla mandó a buscar un core caído que estaba
 * perfectamente vivo: lo que faltaba era el módulo `admin` en el proceso en
 * ejecución, que había arrancado antes de que ese módulo existiera. Un 404 no
 * es un cable desconectado, y un 403 tampoco.
 *
 * El caso que más importa es `prohibido`: cuando core empiece a emitir roles
 * (tarea 1.3) un `admin_organizacion` en `/admin` recibirá un 403 legítimo, y
 * con el catch de antes habría visto "Core no responde. Reintentar" — es
 * decir, se le habría pedido reintentar para siempre algo que nunca va a
 * cambiar. Eso ya lo dice el docblock de `api-admin.acceso()`: un 403 mudo
 * confunde tres pantallas distintas en una sola inútil.
 */
export type Fallo =
  /** `fetch` ni siquiera obtuvo respuesta: core caído, red, o CORS. */
  | { clase: "red" }
  /** La sesión murió. `pedir` ya avisó al gancho; `<Sesion>` está redirigiendo. */
  | { clase: "sesion" }
  /** 403 del guard de core. No se reintenta: no va a cambiar solo. */
  | { clase: "prohibido"; mensaje: string }
  /** 404: hay core, pero sin la ruta pedida. Casi siempre, uno sin reiniciar. */
  | { clase: "sin-panel"; ruta: string }
  /** 5xx u otro: core respondió, y respondió mal. */
  | { clase: "core-roto"; status: number; mensaje: string };

export function clasificar(e: unknown, ruta: string): Fallo {
  // Un fallo de `fetch` no es un ErrorApi: no hubo respuesta que interpretar.
  if (!esErrorApi(e)) return { clase: "red" };
  if (e.status === 401) return { clase: "sesion" };
  if (e.status === 403) return { clase: "prohibido", mensaje: e.message };
  if (e.status === 404) return { clase: "sin-panel", ruta };
  return { clase: "core-roto", status: e.status, mensaje: e.message };
}

/**
 * El texto de cada fallo. Separado del JSX para poder probarlo sin React —
 * es la parte que se equivocó, y la que no puede volver a equivocarse en
 * silencio.
 */
export type Icono = "enchufe" | "llave" | "alerta";

export function describir(fallo: Fallo): {
  titulo: string;
  detalle: string;
  /** Se ofrece SOLO si volver a pedir puede dar otro resultado. */
  reintentar: boolean;
  icono: Icono;
} {
  switch (fallo.clase) {
    case "red":
      return {
        titulo: "Core no responde.",
        detalle:
          "No sabemos si tu sesión sigue viva, y no te sacamos por una duda. Comprueba que core esté arriba en el puerto 3001.",
        reintentar: true,
        icono: "enchufe",
      };
    case "sesion":
      return {
        titulo: "Tu sesión expiró.",
        detalle: "Te estamos llevando al login; desde ahí vuelves a esta página.",
        reintentar: false,
        icono: "llave",
      };
    case "prohibido":
      return {
        titulo: "Esta sesión no alcanza.",
        detalle: `${fallo.mensaje} Reintentar no cambia nada: el permiso te lo da quien administre tu organización, no este botón.`,
        reintentar: false,
        icono: "alerta",
      };
    case "sin-panel":
      return {
        titulo: "Este core no conoce esta consola.",
        detalle: `Core está arriba y respondió, pero no conoce la ruta ${fallo.ruta}. Casi siempre es un proceso que arrancó antes de compilar este módulo: reinícialo (task dev, o pnpm --filter core start) y vuelve.`,
        reintentar: true,
        icono: "enchufe",
      };
    case "core-roto":
      return {
        titulo: `Core respondió ${fallo.status}.`,
        detalle: `${fallo.mensaje} No es tu sesión ni tu rol: el fallo está del lado del servidor, y el log de core tiene el detalle.`,
        reintentar: true,
        icono: "alerta",
      };
  }
}
