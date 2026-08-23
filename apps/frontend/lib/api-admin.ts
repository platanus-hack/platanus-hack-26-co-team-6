/**
 * Cliente de `/admin` — catálogos versionados y modelos (tarea 5.11).
 *
 * Vive fuera de `lib/api.ts` a propósito. Ese archivo es la frontera y ya es
 * el más compartido del frontend: crecer por acumulación lo convierte en el
 * cuello de botella de todos los merges. Lo que NO se duplica aquí, y por eso
 * todo pasa por `pedir`: `credentials: "include"`, la renovación silenciosa de
 * un solo intento y la lectura de los dos formatos de error de core.
 *
 * ── LA CREDENCIAL DE PLATAFORMA, Y POR QUÉ ESTÁ AQUÍ ──────────────
 * Core todavía no emite roles: `admin_plataforma` no es un dato que el
 * servidor pueda verificar hasta la tarea 1.3. Mientras tanto, `/admin` exige
 * la credencial de plataforma (`PULSO_ADMIN_TOKEN`) en la cabecera
 * `X-Pulso-Admin` — la misma que ya gobierna la emisión de tokens de servicio,
 * no una segunda puerta inventada para esto.
 *
 * **Se guarda en memoria del módulo y en ningún otro sitio.** Nada de
 * `localStorage`: la regla del repo dice que el token de sesión no se mueve
 * ahí por comodidad, y esta credencial es más fuerte que una sesión. Recargar
 * la pestaña la olvida, y eso es lo correcto.
 *
 * Cuando 1.3 aterrice, se borra `credencialPlataforma()`, la cabecera y este
 * párrafo. El resto del archivo no cambia.
 */

import { ErrorApi, pedir } from "./api";
import {
  esquemaAcceso,
  esquemaCasoProcesado,
  esquemaCatalogos,
  esquemaEvento,
  esquemaHistorial,
  esquemaVersionesModelo,
  type Acceso,
  type CasoProcesado,
  type Catalogo,
  type Coleccion,
  type EventoAdmin,
  type Historial,
  type Modelo,
  type VersionEntrada,
  type VistaModelo,
} from "./catalogos-modelo";

/** En memoria y solo aquí. Ver el docblock. */
let credencial: string | null = null;

export function fijarCredencialPlataforma(valor: string | null): void {
  credencial = valor && valor.trim() ? valor.trim() : null;
}

export function hayCredencialPlataforma(): boolean {
  return credencial !== null;
}

function cabeceras(): Record<string, string> {
  return credencial ? { "X-Pulso-Admin": credencial } : {};
}

function get<T>(ruta: string): Promise<T> {
  return pedir<T>(ruta, { cache: "no-store", headers: cabeceras() });
}

function post<T>(ruta: string, cuerpo: unknown): Promise<T> {
  return pedir<T>(ruta, {
    method: "POST",
    headers: cabeceras(),
    body: JSON.stringify(cuerpo),
  });
}

// ── Acceso ───────────────────────────────────────────────────────

/**
 * Quién soy, si puedo, y en qué modo corre la administración.
 *
 * Devuelve 200 aunque niegue: la consola necesita distinguir "falta configurar
 * el servidor" de "no es tu consola" de "tienes que desbloquear". Un 403 mudo
 * las confunde en una sola pantalla inútil.
 */
export async function acceso(): Promise<Acceso> {
  const crudo = await get<unknown>("/admin/acceso");
  const leido = esquemaAcceso.safeParse(crudo);
  if (leido.success) return leido.data;

  // Core respondió algo que no entendemos. Se cae del lado de negar.
  return {
    permitido: false,
    motivo: "respuesta-ilegible",
    mensaje: "Core respondió algo que esta consola no sabe leer.",
    identidadReal: false,
    persistencia: "memoria",
    degradacion: [],
  };
}

// ── Catálogos ────────────────────────────────────────────────────

export interface CatalogosCargados {
  catalogos: { catalogo: string; entradas: VersionEntrada[] }[];
  persistencia: string;
}

export async function catalogos(): Promise<CatalogosCargados> {
  const leido = esquemaCatalogos.safeParse(await get<unknown>("/admin/catalogos"));
  if (!leido.success) throw new ErrorApi("Catálogos ilegibles", 500);
  return {
    catalogos: leido.data.catalogos,
    persistencia: leido.data.persistencia ?? "memoria",
  };
}

/** Los códigos REPS válidos. Salen del CodeSystem de MinSalud, no de aquí. */
export async function serviciosReps(): Promise<{ codigo: number; nombre: string }[]> {
  const res = await get<{ servicios?: { codigo: number; nombre: string }[] }>(
    "/admin/catalogos/servicios-reps",
  );
  return res.servicios ?? [];
}

export async function historial(
  catalogo: Coleccion,
  codigo: string,
): Promise<Historial> {
  const leido = esquemaHistorial.safeParse(
    await get<unknown>(`/admin/catalogos/${catalogo}/${encodeURIComponent(codigo)}`),
  );
  if (!leido.success) throw new ErrorApi("Historial ilegible", 500);
  return leido.data;
}

export function crearEntrada(
  catalogo: Catalogo,
  cuerpo: {
    codigo: string;
    etiqueta: string;
    datos: Record<string, unknown>;
    motivo?: string;
  },
): Promise<{ entrada: VersionEntrada }> {
  return post(`/admin/catalogos/${catalogo}`, cuerpo);
}

/**
 * Crea la versión siguiente. `creada: false` no es un fallo: significa que el
 * borrador era idéntico a lo vigente y no había versión que crear.
 */
export function nuevaVersion(
  coleccion: Coleccion,
  codigo: string,
  cuerpo: {
    etiqueta: string;
    datos: Record<string, unknown>;
    activo?: boolean;
    motivo: string;
  },
): Promise<{ entrada: VersionEntrada; creada: boolean }> {
  const base = esModelo(coleccion) ? "/admin/modelos" : "/admin/catalogos";
  return post(`${base}/${coleccion}/${encodeURIComponent(codigo)}/versiones`, cuerpo);
}

function esModelo(c: Coleccion): c is Modelo {
  return c === "prompt_clinico" || c === "config_scoring";
}

/**
 * Prueba del mapa: qué exige la tabla para este diagnóstico, o el hueco.
 *
 * El CIE-10 va en la query y eso no rompe la regla de "sin PII en URLs": es un
 * código de catálogo, no un paciente. Aquí no viaja ningún id de caso ni nada
 * que identifique a alguien.
 */
export function resolverDxEnServidor(
  dx: string,
  propuesto: number[] = [],
): Promise<{ resolucion: unknown; decision: unknown }> {
  const query = new URLSearchParams({ dx });
  if (propuesto.length) query.set("propuesto", propuesto.join(","));
  return get(`/admin/catalogos/resolver-dx?${query.toString()}`);
}

// ── Modelos ──────────────────────────────────────────────────────

export async function modelos(): Promise<VistaModelo[]> {
  const res = await get<unknown>("/admin/modelos");
  const leido = esquemaVersionesModelo.safeParse(res);
  return leido.success ? leido.data.modelos : [];
}

/** ⭐ Con qué versión se procesó un caso. */
export async function casoProcesado(casoId: string): Promise<CasoProcesado> {
  const leido = esquemaCasoProcesado.safeParse(
    await get<unknown>(`/admin/modelos/casos/${encodeURIComponent(casoId)}`),
  );
  if (!leido.success) throw new ErrorApi("Respuesta ilegible", 500);
  return leido.data;
}

/** La vuelta: qué casos se procesaron con una versión. */
export async function casosDeVersion(
  modelo: Modelo,
  codigo: string,
  version?: number,
): Promise<{ casoId: string; procesadoEn: string; version: number }[]> {
  const query = version ? `?version=${version}` : "";
  const res = await get<{
    casos?: { casoId: string; procesadoEn: string; version: number }[];
  }>(`/admin/modelos/${modelo}/${encodeURIComponent(codigo)}/casos${query}`);
  return res.casos ?? [];
}

export function anotarProcesamiento(cuerpo: {
  casoId: string;
  coleccion: Modelo;
  codigo: string;
  version?: number;
  procesadoEn?: string;
}): Promise<{ nuevo: boolean }> {
  return post("/admin/modelos/procesamiento", cuerpo);
}

// ── Auditoría ────────────────────────────────────────────────────

export async function eventos(filtro: {
  coleccion?: string;
  codigo?: string;
  limite?: number;
} = {}): Promise<EventoAdmin[]> {
  const query = new URLSearchParams();
  if (filtro.coleccion) query.set("coleccion", filtro.coleccion);
  if (filtro.codigo) query.set("codigo", filtro.codigo);
  if (filtro.limite) query.set("limite", String(filtro.limite));

  const sufijo = query.toString();
  const res = await get<{ eventos?: unknown[] }>(
    `/admin/eventos${sufijo ? `?${sufijo}` : ""}`,
  );
  return leerEventos(res.eventos ?? []);
}

/** Filtra fila a fila: un evento raro no puede tumbar la vista de auditoría. */
function leerEventos(crudo: unknown[]): EventoAdmin[] {
  return crudo
    .map((e) => esquemaEvento.safeParse(e))
    .filter((r): r is { success: true; data: EventoAdmin } => r.success)
    .map((r) => r.data);
}
