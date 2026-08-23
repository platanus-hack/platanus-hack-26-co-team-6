/**
 * `/invitacion/[token]` — la puerta del invitado.
 *
 * ── PÚBLICA A PROPÓSITO ────────────────────────────────────────────
 * Fuera de `(consolas)` y fuera de `(panel)`: cuelga del layout raíz y no pasa
 * por ninguna guarda de sesión. Quien llega aquí **todavía no tiene cuenta** —
 * conseguirla es exactamente lo que viene a hacer. Pedirle sesión sería pedirle
 * la cuenta que este enlace existe para crearle.
 *
 * ── POR QUÉ ESTE ARCHIVO NO ES `"use client"` ──────────────────────
 * En Next 16 `params` es una promesa. Se resuelve aquí, en el servidor, y el
 * token baja como una prop normal al componente cliente. La alternativa —un
 * componente cliente leyendo `use(params)`— funciona igual, pero deja el
 * `await` mezclado con el estado de la pantalla sin ganar nada.
 *
 * ── NO SE PRE-RENDERIZA NADA ───────────────────────────────────────
 * Esta página no llama a core en el servidor. Toda la lectura de la invitación
 * ocurre en el navegador, contra `NEXT_PUBLIC_API_URL`, igual que el resto del
 * frontend: `lib/api.ts` es LA frontera y no se duplica desde un server
 * component. De paso, el token no atraviesa el renderizador ni sus logs.
 */

import { AceptarInvitacion } from "./AceptarInvitacion";

export const metadata = {
  title: "Invitación · PULSO",
  // Un enlace de un solo uso no tiene por qué acabar en un buscador.
  robots: { index: false, follow: false },
};

export default async function PaginaInvitacion({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <AceptarInvitacion token={token} />;
}
