"use client";

/**
 * Guarda de sesión de las consolas.
 *
 * Envuelve /campo, /hospital y /crue. **No es la seguridad** — la seguridad es
 * el guard de core, que responde 401 y 403 aunque alguien borre este archivo.
 * Esto solo evita tres pantallas malas: la consola en blanco haciendo polling
 * contra un 401, el paramédico mirando una consola que no es la suya sin
 * entender por qué todo falla, y —la peor— un login al que se manda a alguien
 * con un paciente en la camilla porque core dejó de responder un momento.
 *
 * La landing (/) NO va envuelta: es pública a propósito.
 */

import { useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  consolaDeRuta,
  ProveedorSesion,
  ROL_DE_CONSOLA,
  rutaPorRol,
  useSesion,
} from "@/lib/sesion";

export default function Sesion({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const ruta = usePathname();

  // Al volver del login queremos aterrizar donde se cayó, no en el default.
  const alLogin = useCallback(() => {
    router.replace(`/entrar?destino=${encodeURIComponent(ruta)}`);
  }, [router, ruta]);

  return (
    <ProveedorSesion alPerder={alLogin}>
      <Guarda>{children}</Guarda>
    </ProveedorSesion>
  );
}

function Guarda({ children }: { children: React.ReactNode }) {
  const sesion = useSesion();
  const ruta = usePathname();

  // "sin-core" no es "no tienes sesión" y no se trata igual: el proveedor no
  // manda al login (ver `lib/sesion.ts`), así que aquí hay que dar la salida.
  // Es la regla 2 del repo — degrada, lo dice, y ofrece el reintento.
  if (sesion.estado === "sin-core") {
    return (
      <main className="min-h-screen grid place-items-center p-4">
        <div className="w-full max-w-sm rounded-lg border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)] p-6">
          <p className="text-sm mb-1">Core no responde.</p>
          <p className="text-xs text-[color:var(--color-texto-tenue)] mb-5">
            No sabemos si tu sesión sigue viva, y no te sacamos por una duda: si
            estás en mitad de un traslado, sigue por radio con el CRUE.
          </p>
          <button
            type="button"
            onClick={() => void sesion.recargar()}
            className="inline-flex min-h-14 w-full items-center justify-center rounded-md bg-[color:var(--color-marca)] px-4 font-semibold text-white"
          >
            Reintentar
          </button>
        </div>
      </main>
    );
  }

  if (sesion.estado !== "dentro") {
    // "fuera" ya disparó la redirección al login desde el proveedor; aquí solo
    // evitamos el parpadeo de la consola a medio pintar.
    return (
      <main className="min-h-screen grid place-items-center">
        <p className="text-sm text-[color:var(--color-texto-tenue)]">
          Verificando sesión…
        </p>
      </main>
    );
  }

  // En modo legacy `tiene()` devuelve true siempre: la contraseña de turno no
  // trae roles y fingir uno sería peor que no comprobar nada. Es justo la
  // deuda que cierra 1.3, y hasta entonces se comporta como se comportaba.
  const consola = consolaDeRuta(ruta);
  const requerido = ROL_DE_CONSOLA[consola];

  if (requerido && !sesion.tiene(...requerido)) {
    return <NoEsTuConsola consola={consola} suya={rutaPorRol(sesion.roles).destino} />;
  }

  return <>{children}</>;
}

function NoEsTuConsola({ consola, suya }: { consola: string; suya: string }) {
  return (
    <main className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)] p-6">
        <p className="text-sm mb-1">
          Tu rol no opera <code>{consola}</code>.
        </p>
        <p className="text-xs text-[color:var(--color-texto-tenue)] mb-5">
          Core también lo rechaza: esto solo te lo dice antes de que la pantalla
          se llene de errores.
        </p>
        <Link
          href={suya}
          className="inline-flex min-h-14 w-full items-center justify-center rounded-md bg-[color:var(--color-marca)] px-4 text-center font-semibold text-white"
        >
          Ir a {suya}
        </Link>
      </div>
    </main>
  );
}
