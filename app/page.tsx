/**
 * Selector de rol. En el demo se abren dos pantallas a la vez:
 * el celular en /campo y el laptop en /hospital.
 *
 * Esta pantalla no sale en el pitch — es solo la puerta de entrada.
 */

import Link from "next/link";

const ROLES = [
  {
    href: "/campo",
    emoji: "🚑",
    titulo: "Campo",
    quien: "Paramédico / médico de la IPS remisora",
    que: "Dicta el caso, ve el ranking, despacha.",
    dueno: "Juan",
  },
  {
    href: "/hospital",
    emoji: "🏥",
    titulo: "Urgencias",
    quien: "Jefe de urgencias de la IPS receptora",
    que: "Recibe la tarjeta. Dos botones.",
    dueno: "Sebas",
  },
  {
    href: "/crue",
    emoji: "📡",
    titulo: "CRUE",
    quien: "Centro Regulador de Urgencias y Emergencias",
    que: "Ve todos los casos activos. Puede forzar destino.",
    dueno: "Zaid",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto flex flex-col justify-center">
      <header className="mb-10">
        <div className="flex items-center gap-3">
          <span className="text-4xl">🫀</span>
          <h1 className="text-4xl font-bold tracking-tight">PULSO</h1>
        </div>
        <p className="mt-3 text-[color:var(--color-texto-tenue)] text-lg">
          Del dictado al hospital que sí puede recibirlo, en menos de 90 segundos.
        </p>
      </header>

      <nav className="grid gap-3">
        {ROLES.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="block p-5 rounded-xl border border-[color:var(--color-borde)]
                       bg-[color:var(--color-superficie)] hover:bg-[color:var(--color-superficie-alta)]
                       transition-colors"
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl">{r.emoji}</span>
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-xl font-semibold">{r.titulo}</h2>
                  <span className="text-xs text-[color:var(--color-texto-tenue)]">
                    · {r.dueno}
                  </span>
                </div>
                <p className="text-sm text-[color:var(--color-texto-tenue)]">{r.quien}</p>
                <p className="text-sm mt-1">{r.que}</p>
              </div>
            </div>
          </Link>
        ))}
      </nav>

      <footer className="mt-10 text-xs text-[color:var(--color-texto-tenue)] leading-relaxed">
        <p>
          Datos de sedes: REPS — Registro Especial de Prestadores de Servicios de Salud
          (MinSalud). Vocabulario de servicios: CodeSystem FHIR
          <code className="mx-1">REPShealthcareServices</code> de MinSalud.
        </p>
        <p className="mt-2">
          PULSO propone; el CRUE regula (Res. 1220/2010). Triage según Res. 5596/2015.
        </p>
      </footer>
    </main>
  );
}
