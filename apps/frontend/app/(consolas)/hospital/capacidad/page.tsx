"use client";

/**
 * /hospital/capacidad — donde el jefe de urgencias declara.
 *
 * ── POR QUÉ ESTA PANTALLA IMPORTA MÁS QUE LAS DEMÁS ───────────────
 * Es la más usada del sistema: 20 veces por turno, a las 3 de la mañana, con
 * guantes. Y es la única fuente de verdad sobre la capacidad real de la red.
 * Sin ella, el ranking sigue decidiendo a dónde va un infarto con un snapshot
 * REPS del 2022-11-30. Si declarar contingencia costara más de dos toques,
 * nadie lo haría y todo el modelo de capacidad declarada se caería solo.
 *
 * Por eso:
 *   Un toque    → estado operativo (cuatro botones de 88 px).
 *   Dos toques  → contingencia con motivo. No hay un tercero.
 *   Sin teclado → las camas se mueven con `−` y `+` de 56 px.
 *   Sin GUARDAR → cada control guarda solo. Un botón al final se olvida.
 *
 * ── LO QUE ESTA PANTALLA NO HACE ──────────────────────────────────
 * No finge. La tarea 3.3 (Zaid) es la que construye `sede_estado`,
 * `capacidad_declarada` y los endpoints; hasta que esté desplegada, core
 * responde 404 y **esta vista lo dice con todas las letras** en vez de pintar
 * un "guardado" que no ocurrió. El contrato exacto que necesita de 3.3 está
 * documentado en `lib/api-capacidad.ts`.
 *
 * Es la misma honestidad de `GET /capacidades` y de la barra de `/campo`, y es
 * la regla 2 del repo: todo degrada, y lo dice.
 *
 * Las reglas puras (caducidad, procedencia, si un estado exige motivo, el
 * reductor optimista con reversión) viven en `lib/capacidad-modelo.ts`, sin
 * React y con tests en `lib/capacidad-modelo.test.mts`.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as api from "@/lib/api";
import type { CongestionSede } from "@/lib/types";
import { useSesion } from "@/lib/sesion";
import {
  claveCama,
  exigeMotivo,
  MOTIVO_OTRO,
  type EstadoOperativo,
} from "@/lib/capacidad-modelo";
import { useDeclaracion } from "@/components/hospital/capacidad/useDeclaracion";
import { AvisoReversion } from "@/components/hospital/capacidad/AvisoReversion";
import { BotonesEstado } from "@/components/hospital/capacidad/BotonesEstado";
import { ElegirMotivo } from "@/components/hospital/capacidad/ElegirMotivo";
import { FilaCama } from "@/components/hospital/capacidad/FilaCama";
import { Procedencia } from "@/components/hospital/capacidad/Procedencia";
import { SelectorSede } from "@/components/hospital/capacidad/SelectorSede";

/**
 * `useSearchParams` obliga a un límite de Suspense: sin él, Next renderiza en
 * cliente todo el árbol de arriba. Ver `node_modules/next/dist/docs/…/
 * use-search-params.md` § Prerendering.
 */
export default function Capacidad() {
  return (
    <Suspense fallback={<Cargando />}>
      <Pantalla />
    </Suspense>
  );
}

function Pantalla() {
  const sesion = useSesion();
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();

  // ── Qué sede ───────────────────────────────────────────────────
  //
  // La sede va en la URL para que un refresco a las 3 a.m. no obligue a
  // volver a elegirla. El código de habilitación es dato público del REPS —
  // no es PII y puede ir ahí; `textoCrudo` y `origen` jamás.
  const propias = sesion.sedes;
  const sedeCodigo = params.get("sede") || propias[0] || null;

  // Con la sede ya resuelta, la lista se colapsa a una línea. `cambiando` es
  // lo que la vuelve a abrir: no basta con borrar el parámetro de la URL,
  // porque el alcance de la sesión volvería a resolverla al instante y el
  // botón "Cambiar" no haría nada visible.
  const [cambiando, setCambiando] = useState(false);

  const elegirSede = useCallback(
    (codigo: string) => {
      if (!codigo) {
        setCambiando(true);
        return;
      }
      setCambiando(false);
      router.replace(`${ruta}?sede=${encodeURIComponent(codigo)}`);
    },
    [router, ruta],
  );

  const { sedes, cargandoSedes } = useSedesDisponibles(propias);

  // ── La declaración ─────────────────────────────────────────────

  const decl = useDeclaracion(sedeCodigo, sesion.actor?.id);
  const { vista } = decl;

  const [eligiendo, setEligiendo] = useState<Exclude<
    EstadoOperativo,
    "recibiendo"
  > | null>(null);

  const alElegirEstado = (estado: EstadoOperativo) => {
    // Volver a recibir no pide nada: es un toque y ya. Pedirle motivo a quien
    // reabre su urgencia es fricción sobre el camino que queremos que sea el
    // más fácil de todos.
    if (!exigeMotivo(estado)) {
      setEligiendo(null);
      decl.declararOperativo(estado, null);
      return;
    }
    setEligiendo(estado as Exclude<EstadoOperativo, "recibiendo">);
  };

  const alElegirMotivo = (motivo: string) => {
    if (!eligiendo) return;
    decl.declararOperativo(eligiendo, motivo);
    setEligiendo(null);
  };

  const sinSede = sedeCodigo === null;

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-4 pb-16">
      <Cabecera nombreSede={sedes.find((s) => s.codigo === sedeCodigo)?.nombre} />

      {/* Arriba del todo, siempre: de dónde salió el dato y hasta cuándo vale.
          Son las dos preguntas que no se pueden tener que ir a buscar. */}
      <Procedencia
        procedencia={vista.procedencia}
        caducidad={vista.caducidad}
        onRecargar={decl.recargar}
      />

      {/* Siempre visible: declarar por el hospital de al lado por haber tocado
          la fila equivocada es un error que no se descubre hasta que llega una
          ambulancia. Ocupa una línea cuando ya está resuelta. */}
      <SelectorSede
        sedes={sedes}
        actual={cambiando ? null : sedeCodigo}
        cargando={cargandoSedes}
        restringida={propias.length > 0}
        onElegir={elegirSede}
      />

      <BotonesEstado
        actual={vista.operativo}
        pendiente={vista.operativoPendiente}
        deshabilitado={sinSede}
        onElegir={alElegirEstado}
      />

      {eligiendo && (
        <ElegirMotivo
          estado={eligiendo}
          onElegir={alElegirMotivo}
          onCancelar={() => setEligiendo(null)}
        />
      )}

      {vista.motivo && !eligiendo && (
        <p className="mt-2 text-sm">
          <span className="text-[color:var(--color-texto-tenue)]">Motivo: </span>
          {vista.motivo}
        </p>
      )}

      {/* "Otro" declara en un toque y sin teclado; el detalle es opcional y
          llega después. Un campo obligatorio de texto aquí es cómo se pierde
          una declaración entera. */}
      {vista.motivo === MOTIVO_OTRO && !eligiendo && vista.operativo && (
        <DetalleOtro
          onGuardar={(detalle) => decl.declararOperativo(vista.operativo!, detalle)}
        />
      )}

      {vista.operativoRevertido && (
        <AvisoReversion
          mensaje={vista.operativoRevertido.mensaje}
          onReintentar={() => decl.reintentar("operativo")}
          onCerrar={() => decl.descartarAviso("operativo")}
        />
      )}

      <Camas decl={decl} sinSede={sinSede} cargando={decl.cargando} />

      <p className="mt-8 text-xs text-[color:var(--color-texto-tenue)]">
        Lo que declares aquí es una declaración de capacidad con fecha, hora y
        autor: filtra el ranking y queda en la auditoría. PULSO propone; quien
        decide qué puede recibir esta sede eres tú.
      </p>
    </main>
  );
}

// ── Piezas de la página ──────────────────────────────────────────

function Cabecera({ nombreSede }: { nombreSede?: string }) {
  return (
    <header className="mb-4">
      <div className="flex items-center gap-2">
        <span className="text-2xl" aria-hidden>
          🏥
        </span>
        <span className="font-bold text-lg">PULSO</span>
        <Link
          href="/hospital"
          className="ml-auto inline-flex min-h-14 items-center rounded-lg px-4
                     border border-[color:var(--color-borde)]"
        >
          Solicitudes
        </Link>
      </div>
      <h1 className="mt-2 text-xl font-bold">Capacidad declarada</h1>
      {nombreSede && (
        <p className="text-sm text-[color:var(--color-texto-tenue)] truncate">
          {nombreSede}
        </p>
      )}
    </header>
  );
}

function Camas({
  decl,
  sinSede,
  cargando,
}: {
  decl: ReturnType<typeof useDeclaracion>;
  sinSede: boolean;
  cargando: boolean;
}) {
  const { camas, procedencia } = decl.vista;

  return (
    <section aria-labelledby="titulo-camas" className="mt-6">
      <h2 id="titulo-camas" className="text-sm font-semibold mb-2">
        Camas disponibles
      </h2>

      {camas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[color:var(--color-borde)] p-4 text-sm text-[color:var(--color-texto-tenue)]">
          {cargando
            ? "Preguntando a core…"
            : // No hay camas que pintar y hay que decir por qué. Inventar una
              // fila con un cero sería declarar que no hay camas, que es una
              // afirmación que nadie verificó.
              `No hay camas que mostrar. ${procedencia.detalle}`}
        </p>
      ) : (
        <ul className="space-y-2">
          {camas.map((fila) => (
            <FilaCama
              key={fila.tipo}
              fila={fila}
              deshabilitada={sinSede}
              onFijar={(disponibles) => decl.fijarCamas(fila.tipo, disponibles)}
              onReintentar={() => decl.reintentar(claveCama(fila.tipo))}
              onDescartar={() => decl.descartarAviso(claveCama(fila.tipo))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Detalle opcional del motivo "Otro". Aparece DESPUÉS de haber declarado. */
function DetalleOtro({ onGuardar }: { onGuardar: (detalle: string) => void }) {
  const [texto, setTexto] = useState("");

  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const limpio = texto.trim();
        if (limpio) onGuardar(limpio);
      }}
    >
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Detalle (opcional)"
        aria-label="Detalle del motivo"
        className="flex-1 min-w-0 min-h-14 rounded-lg px-3
                   bg-[color:var(--color-superficie-alta)]
                   border border-[color:var(--color-borde)]"
      />
      <button
        type="submit"
        disabled={texto.trim() === ""}
        className="min-h-14 shrink-0 rounded-lg px-4 font-semibold
                   border border-[color:var(--color-borde)]
                   disabled:opacity-40"
      >
        Añadir
      </button>
    </form>
  );
}

function Cargando() {
  return (
    <main className="min-h-screen grid place-items-center">
      <p className="text-sm text-[color:var(--color-texto-tenue)]">
        Abriendo la declaración de capacidad…
      </p>
    </main>
  );
}

// ── Lista de sedes ───────────────────────────────────────────────

/**
 * Las sedes entre las que se puede elegir.
 *
 * Salen de `GET /estado` (`congestion[]`) porque es lo único que core expone
 * hoy con código y nombre de sede; cuando exista `GET /sedes` viene de ahí y
 * este hook cambia una línea.
 *
 * Si la sesión trae alcance por sede, la lista se recorta a ese alcance. Es
 * cortesía de UI: el 403 lo da core. Pero evita que alguien declare por el
 * hospital de al lado por tocar la fila equivocada con guantes.
 */
function useSedesDisponibles(propias: string[]) {
  const [sedes, setSedes] = useState<CongestionSede[]>([]);
  const [cargandoSedes, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    // Un fallo aquí no es un error que pintar en rojo: de que core no responde
    // ya informa el rótulo de procedencia. Duplicarlo sería ruido.
    void api
      .estado()
      .catch(() => null)
      .then((d) => {
        if (!vivo) return;
        setSedes(d?.congestion ?? []);
        setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const visibles = useMemo(
    () =>
      propias.length === 0
        ? sedes
        : sedes.filter((s) => propias.includes(s.codigo)),
    [sedes, propias],
  );

  return { sedes: visibles, cargandoSedes };
}
