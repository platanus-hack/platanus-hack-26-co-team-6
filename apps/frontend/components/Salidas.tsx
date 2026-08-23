/**
 * Las puertas de vuelta.
 *
 * Existe porque hasta ahora el frontend no tenía ninguna: una URL mal
 * tecleada, un `casoId` que ya no está o un render que revienta caían en la
 * pantalla por defecto de Next —fondo blanco, sin marca y sin un solo enlace—
 * y desde ahí solo se sale escribiendo una ruta a mano.
 *
 * En una consola de urgencias eso no es una molestia estética. La usa alguien
 * con guantes, a las 3 a.m., que probablemente llegó ahí desde un enlace que
 * le pasaron por radio. La salida tiene que estar en la pantalla, no en su
 * memoria.
 *
 * Se pintan las tres consolas de operación y nada más. `/panel`, `/admin` y
 * `/auditoria` existen pero son de escritorio y con rol: ofrecérselas a quien
 * se perdió sería mandarlo a un 403.
 */

import Link from "next/link";

const CONSOLAS = [
  { href: "/campo", etiqueta: "Campo", quien: "paramédico" },
  { href: "/hospital", etiqueta: "Urgencias", quien: "hospital" },
  { href: "/crue", etiqueta: "CRUE", quien: "regulador" },
] as const;

export function Salidas() {
  return (
    <nav aria-label="Volver a una consola" className="flex flex-col gap-2">
      {CONSOLAS.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          className="inline-flex min-h-14 items-center justify-between gap-3 rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-superficie-alta)] px-4 font-semibold"
        >
          <span>{c.etiqueta}</span>
          <span className="text-xs font-normal text-[color:var(--color-texto-tenue)]">
            {c.quien}
          </span>
        </Link>
      ))}
    </nav>
  );
}

/** Marco común de las dos pantallas de rescate. Centrado, legible, sin adornos. */
export function Rescate({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)] p-6">
        <h1 className="mb-1 text-lg font-semibold">{titulo}</h1>
        {children}
      </div>
    </main>
  );
}
