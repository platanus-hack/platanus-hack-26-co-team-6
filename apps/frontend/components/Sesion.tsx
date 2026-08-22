"use client";

/**
 * Guarda de sesión de las consolas.
 *
 * Envuelve /campo, /hospital y /crue. No es la seguridad — la seguridad es el
 * guard de core, que responde 401 aunque alguien borre este componente. Esto
 * solo evita que la consola se quede en blanco haciendo polling contra 401.
 *
 * La landing (/) NO va envuelta: es pública a propósito.
 */

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import * as api from "@/lib/api";

export default function Sesion({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const ruta = usePathname();
  const [estado, setEstado] = useState<"cargando" | "dentro">("cargando");

  useEffect(() => {
    let vivo = true;
    const alLogin = () => router.replace(`/entrar?destino=${encodeURIComponent(ruta)}`);

    // Si la sesión expira a mitad de turno, api.ts nos avisa desde cualquier
    // petición y salimos de una vez, sin esperar al siguiente tick del polling.
    api.alPerderSesion(alLogin);

    api
      .sesion()
      .then(({ autenticado }) => {
        if (!vivo) return;
        if (autenticado) setEstado("dentro");
        else alLogin();
      })
      // core caído: mandamos al login, que muestra el error de verdad.
      .catch(() => vivo && alLogin());

    return () => {
      vivo = false;
      api.alPerderSesion(null);
    };
  }, [router, ruta]);

  if (estado === "cargando") {
    return (
      <main className="min-h-screen grid place-items-center">
        <p className="text-sm text-[color:var(--color-texto-tenue)]">
          Verificando sesión…
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
