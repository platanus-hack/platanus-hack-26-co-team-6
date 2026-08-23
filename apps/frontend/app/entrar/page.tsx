"use client";

/**
 * /entrar — puerta de las consolas.
 *
 * DOS PUERTAS, y la diferencia importa — tarea 1.3:
 *
 *   · **Turno compartido.** La contraseña de siempre. Sigue abierta mientras
 *     `PULSO_AUTH_LEGACY` esté encendido en core, para no dejar al equipo
 *     fuera mientras no existan actores reales. Quien entra así queda en la
 *     auditoría como el turno, no como una persona.
 *
 *   · **Cuenta propia.** Correo y contraseña. El token que vuelve lleva
 *     organización, roles y sedes, y entonces "¿quién aceptó a este paciente?"
 *     tiene por fin una respuesta con nombre.
 *
 * En los dos casos core devuelve una cookie HttpOnly. Este archivo nunca ve el
 * token de sesión, y no guarda la contraseña en ningún sitio.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as api from "@/lib/api";
import { ErrorApi } from "@/lib/api";

const DESTINO_POR_DEFECTO = "/campo";

/**
 * A dónde mandar tras entrar, leído de `?destino=` en el momento del submit.
 *
 * Se lee aquí y no con useSearchParams porque eso obligaría a un <Suspense>
 * alrededor de la página entera solo para un query param.
 *
 * ⚠️ Solo rutas internas. "/algo" vale; "//evil.com" NO, aunque empiece por
 *    "/": el navegador lo trata como URL protocolo-relativa y saldría del
 *    sitio. Un login que redirige a donde le digan es un regalo para phishing.
 */
function destinoSeguro(): string {
  if (typeof window === "undefined") return DESTINO_POR_DEFECTO;

  const destino = new URLSearchParams(window.location.search).get("destino");
  if (!destino) return DESTINO_POR_DEFECTO;

  const interno = destino.startsWith("/") && !destino.startsWith("//");
  return interno ? destino : DESTINO_POR_DEFECTO;
}

export default function Entrar() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [identificador, setIdentificador] = useState("");
  const [conCuenta, setConCuenta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.login(password, conCuenta ? identificador : undefined);
      setPassword("");
      router.replace(destinoSeguro());
    } catch (err) {
      setError(
        err instanceof ErrorApi && err.status === 401
          ? "Credenciales incorrectas."
          : err instanceof ErrorApi && err.status === 403
            ? // Bloqueo progresivo: core ya dice cuántos segundos faltan y ese
              // mensaje es más útil que uno inventado aquí.
              err.message
            : "No se pudo contactar a core. ¿Está corriendo en el puerto 3001?"
      );
      setEnviando(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-4">
      <form
        onSubmit={entrar}
        className="w-full max-w-sm rounded-lg border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)] p-6"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🚑</span>
          <span className="font-bold text-lg">PULSO</span>
        </div>
        <p className="text-xs text-[color:var(--color-texto-tenue)] mb-6">
          Consola de operación. Acceso restringido al personal de turno.
        </p>

        {conCuenta && (
          <>
            <label htmlFor="identificador" className="block text-sm mb-2">
              Correo
            </label>
            <input
              id="identificador"
              type="email"
              autoFocus
              autoComplete="username"
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
              className="w-full mb-4 rounded-md border border-[color:var(--color-borde)] bg-[color:var(--color-fondo)] px-3 py-2 text-base outline-none focus:border-[color:var(--color-info)]"
            />
          </>
        )}

        <label htmlFor="password" className="block text-sm mb-2">
          {conCuenta ? "Contraseña" : "Contraseña de turno"}
        </label>
        <input
          id="password"
          type="password"
          autoFocus={!conCuenta}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-[color:var(--color-borde)] bg-[color:var(--color-fondo)] px-3 py-2 text-base outline-none focus:border-[color:var(--color-info)]"
        />

        {error && (
          <p role="alert" className="mt-3 text-sm text-[color:var(--color-critico)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={
            enviando ||
            password.length === 0 ||
            (conCuenta && identificador.length === 0)
          }
          className="mt-5 w-full rounded-md bg-[color:var(--color-marca)] px-4 py-2.5 font-semibold text-white disabled:opacity-40"
        >
          {enviando ? "Entrando…" : "Entrar"}
        </button>

        <button
          type="button"
          onClick={() => {
            setConCuenta(!conCuenta);
            setError(null);
          }}
          className="mt-4 w-full text-xs underline text-[color:var(--color-texto-tenue)]"
        >
          {conCuenta
            ? "Entrar con la contraseña de turno"
            : "Entrar con mi cuenta"}
        </button>

        <p className="mt-4 text-xs text-[color:var(--color-texto-tenue)]">
          {conCuenta
            ? "Tu cuenta te atribuye lo que hagas: quién aceptó cada traslado queda con tu nombre, no con el del turno."
            : "Sin OPERADOR_PASSWORD configurado, core imprime una contraseña aleatoria en su consola al arrancar."}
        </p>
      </form>
    </main>
  );
}
