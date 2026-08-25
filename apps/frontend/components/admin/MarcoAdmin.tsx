"use client";

/**
 * El marco de `/admin`: cabecera, navegación, la puerta y los avisos.
 *
 * ── POR QUÉ LA PUERTA SE PINTA AQUÍ Y NO EN CADA PÁGINA ───────────
 * Porque la seguridad **no** es esto. Core responde 403 aunque alguien borre
 * este archivo — el guard está en `core/src/admin/admin.guard.ts` y la
 * decisión en `acceso-admin.ts`. Lo de aquí evita dos pantallas malas: la
 * consola en blanco llenándose de errores, y un admin de organización sin
 * entender por qué todo falla.
 *
 * ── Y POR QUÉ HAY UN CAMPO PARA UNA CREDENCIAL ────────────────────
 * Core todavía no emite roles (tarea 1.3): `admin_plataforma` no es un dato
 * que el servidor pueda verificar. Hasta entonces `/admin` exige la credencial
 * de plataforma. Se guarda **solo en memoria** (ver `lib/api-admin.ts`);
 * recargar la pestaña la olvida, y eso es lo correcto.
 *
 * Cuando 1.3 aterrice, `identidadReal` llega en `true` y este formulario deja
 * de aparecer solo — sin tocar este archivo.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, KeyRound, PlugZap, ShieldCheck } from "lucide-react";
import * as admin from "@/lib/api-admin";
import { clasificar, describir, type Fallo, type Icono } from "@/lib/fallo-core";
import type { Acceso } from "@/lib/catalogos-modelo";
import { LogoPulso } from "@/components/LogoPulso";

interface Estado {
  acceso: Acceso | null;
  cargando: boolean;
  /** Por qué no hay veredicto. `null` = lo hay (mira `acceso`). */
  fallo: Fallo | null;
  recargar: () => Promise<void>;
}

const Contexto = createContext<Estado>({
  acceso: null,
  cargando: true,
  fallo: null,
  recargar: async () => {},
});

export function useAdmin(): Estado {
  return useContext(Contexto);
}

const PESTANAS = [
  { href: "/admin/catalogos", texto: "Catálogos" },
  { href: "/admin/modelos", texto: "Modelos" },
];

export function MarcoAdmin({ children }: { children: ReactNode }) {
  const [acceso, setAcceso] = useState<Acceso | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState<Fallo | null>(null);
  const ruta = usePathname();

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      setAcceso(await admin.acceso());
      setFallo(null);
    } catch (e) {
      // Que core no conteste no es una excepción que subir: es un estado que
      // pintar. Pero *cuál* estado importa — ver `Fallo`.
      setAcceso(null);
      setFallo(clasificar(e, "/admin/acceso"));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return (
    <Contexto.Provider value={{ acceso, cargando, fallo, recargar }}>
      <div className="min-h-dvh bg-[color:var(--color-fondo)] text-[color:var(--color-texto)]">
        <header className="border-b border-[color:var(--color-borde)] bg-[color:var(--color-superficie)]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
            <Link href="/admin/catalogos" className="flex items-center gap-2.5">
              <LogoPulso className="h-4 w-auto text-[color:var(--color-marca)]" decorativo />
              <span className="text-sm font-semibold tracking-tight">
                Administración de plataforma
              </span>
            </Link>

            <nav className="flex gap-1" aria-label="Secciones de administración">
              {PESTANAS.map((p) => {
                const activa = ruta.startsWith(p.href);
                return (
                  <Link
                    key={p.href}
                    href={p.href}
                    aria-current={activa ? "page" : undefined}
                    className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm transition-colors ${
                      activa
                        ? "bg-[color:var(--color-superficie-alta)] text-[color:var(--color-texto)]"
                        : "text-[color:var(--color-texto-tenue)] hover:text-[color:var(--color-texto)]"
                    }`}
                  >
                    {p.texto}
                  </Link>
                );
              })}
            </nav>

            {acceso?.permitido && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-[color:var(--color-texto-tenue)]">
                <ShieldCheck className="size-3.5 text-[color:var(--color-estable)]" aria-hidden />
                {acceso.actor}
                <span aria-hidden>·</span>
                {/* Cómo entró. Con 1.3 esto dirá "rol" y no "puente". */}
                {acceso.via === "rol" ? "rol admin_plataforma" : "credencial de plataforma"}
              </span>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6">
          {cargando && <Cargando />}
          {!cargando && fallo && <PantallaFallo fallo={fallo} onReintentar={recargar} />}
          {!cargando && !fallo && acceso && !acceso.permitido && (
            <Puerta acceso={acceso} onEntrar={recargar} />
          )}
          {!cargando && !fallo && acceso?.permitido && (
            <>
              <Degradacion avisos={acceso.degradacion} />
              {children}
            </>
          )}
        </main>
      </div>
    </Contexto.Provider>
  );
}

function Cargando() {
  return (
    <p className="text-sm text-[color:var(--color-texto-tenue)]">Verificando acceso…</p>
  );
}

/**
 * Un fallo, dicho por su nombre y con la salida que le corresponde.
 *
 * `reintentar` es la diferencia que hace útil esta pantalla: se ofrece solo
 * cuando volver a pedir puede dar otro resultado. Ofrecerlo en un 403 es
 * invitar a pulsar un botón para siempre.
 */
const ICONOS: Record<Icono, typeof AlertTriangle> = {
  enchufe: PlugZap,
  llave: KeyRound,
  alerta: AlertTriangle,
};

function PantallaFallo({
  fallo,
  onReintentar,
}: {
  fallo: Fallo;
  onReintentar: () => void;
}) {
  const { titulo, detalle, reintentar, icono } = describir(fallo);
  const Icono = ICONOS[icono];
  return (
    <Tarjeta>
      <div className="flex items-start gap-3">
        <Icono
          className="mt-0.5 size-5 shrink-0 text-[color:var(--color-alerta)]"
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{titulo}</p>
          <p className="mt-1 text-xs leading-relaxed text-[color:var(--color-texto-tenue)]">
            {detalle}
          </p>
        </div>
      </div>
      {reintentar && (
        <button
          type="button"
          onClick={onReintentar}
          className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[color:var(--color-marca)] px-4 text-sm font-semibold text-white"
        >
          Reintentar
        </button>
      )}
    </Tarjeta>
  );
}

/**
 * Lo que se ve cuando no se puede entrar. Explica **cuál** de las tres cosas
 * falta, porque un 403 mudo las confunde en una sola pantalla inútil.
 */
function Puerta({ acceso, onEntrar }: { acceso: Acceso; onEntrar: () => Promise<void> }) {
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Si core ya emite roles, la credencial no sirve para nada: el problema es
  // el rol, y ofrecer el campo sería mandar a alguien a probar suerte.
  const puedeDesbloquear =
    !acceso.identidadReal &&
    acceso.motivo !== "plataforma-sin-credencial" &&
    acceso.motivo !== "identidad-de-servicio";

  async function desbloquear(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    admin.fijarCredencialPlataforma(valor);
    await onEntrar();
    setEnviando(false);
  }

  return (
    <Tarjeta>
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="mt-0.5 size-5 shrink-0 text-[color:var(--color-alerta)]"
          aria-hidden
        />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold">No puedes administrar la plataforma</h1>
          <p className="mt-1 text-sm text-[color:var(--color-texto-tenue)]">
            {acceso.mensaje ?? "Acceso denegado."}
          </p>
        </div>
      </div>

      {puedeDesbloquear && (
        <form onSubmit={desbloquear} className="mt-6">
          <label
            htmlFor="credencial"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-texto-tenue)]"
          >
            Credencial de plataforma
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="credencial"
              type="password"
              autoComplete="off"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="h-12 min-w-0 flex-1 rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-fondo)] px-3.5 text-base outline-none focus:border-[color:var(--color-info)]"
            />
            <button
              type="submit"
              disabled={enviando || !valor.trim()}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[color:var(--color-marca)] px-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              <KeyRound className="size-4" aria-hidden />
              Desbloquear
            </button>
          </div>
          <p className="mt-2 text-xs text-[color:var(--color-texto-tenue)]">
            Es <code>PULSO_ADMIN_TOKEN</code> de core. Provisional: cuando la identidad real
            (tarea 1.3) aterrice, esta consola se abre con tu rol y este campo desaparece.
            No se guarda en el navegador — recargar la pestaña la olvida.
          </p>
        </form>
      )}
    </Tarjeta>
  );
}

/**
 * Lo que esta consola NO puede hacer todavía, en voz alta y permanente.
 *
 * Regla 2 del repo. Aquí pesa más que en otras pantallas: un admin que cree
 * que sus cambios ya rigen en el motor —cuando el motor sigue leyendo sus
 * constantes compiladas— es peor que un admin sin consola.
 */
function Degradacion({ avisos }: { avisos: string[] }) {
  if (avisos.length === 0) return null;
  return (
    <div className="mb-6 rounded-xl border border-[color:var(--color-alerta)]/40 bg-[color:var(--color-alerta)]/8 p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-alerta)]">
        <AlertTriangle className="size-3.5" aria-hidden />
        En qué modo corre esto
      </p>
      <ul className="mt-2 space-y-1.5">
        {avisos.map((a) => (
          <li key={a} className="text-xs leading-relaxed text-[color:var(--color-texto-tenue)]">
            {a}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Tarjeta({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)] p-5 ${className}`}
    >
      {children}
    </section>
  );
}
