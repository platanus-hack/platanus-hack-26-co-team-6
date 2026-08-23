"use client";

/**
 * ═══════════════════════════════════════════════════════════════════
 *  /hospital/recepcion/:casoId — EL PAQUETE DE PREARRIBO
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Aquí vive la hora dorada que ganó el ruteo. Hoy el hospital acepta un
 *  traslado y NO VUELVE A SABER NADA hasta que la camilla cruza la puerta; ese
 *  hueco se come la mitad del tiempo que el motor de ruteo ahorró. Esta
 *  pantalla es lo que ocupa ese hueco: qué llega, en cuánto, cuánto tiempo le
 *  queda al paciente y qué falta en la sala.
 *
 *  ── ES UNA PANTALLA DE PARED, NO UNA CONSOLA ──────────────────────
 *  Se lee a dos metros, de paso, desde la puerta. De ahí la tipografía en
 *  `clamp()` con mínimos altos, los `tabular-nums` en todo número, y que lo
 *  accionable sea UNA cosa: confirmar ítems de preparación.
 *
 *  ── LO QUE ESTA VISTA NO PUEDE HACER SOLA ─────────────────────────
 *  Cuatro tareas de las que depende no están hechas, y ninguna se finge:
 *
 *    4.1  el paquete de prearribo en core   → se reconstruye desde GET /estado
 *    4.2  el generador de SBAR              → se compone de los campos del caso
 *    3.7  la posición del móvil en vivo     → ETA del despacho, marcado
 *    4.4  las ventanas clínicas             → sin ventana, y se dice
 *    3.9  el canal caso:{id}                → sondeo cada 3 s, declarado
 *
 *  Todo eso se pinta en `<HuecosDeclarados>`. Es la regla 2 del repo llevada a
 *  una pantalla de la que dependen decisiones clínicas: degradar está bien,
 *  degradar en silencio no.
 *
 *  ── ALCANCE: SOLO LA SEDE DESTINATARIA ────────────────────────────
 *  ⚠️ La comprobación de sede que hace esta página es DE CORTESÍA. Evita que
 *  alguien de otra sede vea media pantalla clínica antes de llenarse de
 *  errores, y nada más. **El 403 de verdad lo tiene que dar core (tarea 4.1)**,
 *  en el servidor y contra la sesión — cualquiera puede borrar este archivo o
 *  llamar al endpoint con curl. Mientras la sesión siga en modo `legacy` (una
 *  contraseña de turno compartida, sin actor ni sede), esta comprobación no
 *  puede bloquear a nadie: no hay a quién comparar. La cierra la tarea 1.3.
 *
 *  ── SIN DICTADO CRUDO ─────────────────────────────────────────────
 *  `CasoPublico` excluye `textoCrudo` y `origen` a propósito, y `despojar()` en
 *  core deja de compilar si alguien los agrega. Esta pantalla cuelga de un
 *  pasillo de urgencias: el audio literal de la escena no tiene nada que hacer
 *  aquí, y el paquete de 4.1 tampoco debe traerlo.
 */

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Radio } from "lucide-react";
import {
  confirmarItem,
  obtenerRecepcion,
  recepcionDesdeEstado,
} from "@/lib/api-recepcion";
import {
  cuentaLlegada,
  estadoVentana,
  huecosDe,
  progresoPreparacion,
  rotularEta,
  type PaqueteRecepcion,
} from "@/lib/recepcion-modelo";
import { nombresServicios } from "@/lib/presentacion";
import { useCapacidades } from "@/lib/useCapacidades";
import { useSesion } from "@/lib/sesion";
import { MarcaPulso } from "@/components/hospital/MarcaPulso";
import { CabeceraPrearribo } from "@/components/hospital/recepcion/CabeceraPrearribo";
import { BloqueSbar } from "@/components/hospital/recepcion/BloqueSbar";
import { TresRelojes } from "@/components/hospital/recepcion/TresRelojes";
import { ChecklistPreparacion } from "@/components/hospital/recepcion/ChecklistPreparacion";
import { HuecosDeclarados } from "@/components/hospital/recepcion/HuecosDeclarados";
import { useAhora } from "@/components/hospital/recepcion/useAhora";

/**
 * Sondeo cada 3 s. Es el piso de la tarea 3.9: cuando exista el canal
 * `caso:{id}` esto se apaga y la pantalla se actualiza al escribir. Mientras
 * tanto, 3 s es lo que permite que una confirmación hecha en otro puesto
 * aparezca aquí antes de que alguien la repita.
 */
const SONDEO_MS = 3000;

/**
 * Cada cuántos sondeos se vuelve a probar el endpoint de 4.1 cuando ya
 * respondió 404. Sin esto, pedirlo cada 3 s serían dos peticiones muertas por
 * tick durante todo el turno; sin volver a probarlo nunca, la pantalla se
 * quedaría en modo degradado hasta que alguien recargue el día que 4.1 salga.
 */
const REINTENTOS_ENTRE_PRUEBAS = 10;

type Vista =
  | { fase: "cargando" }
  | { fase: "ok"; paquete: PaqueteRecepcion }
  | { fase: "prohibido"; mensaje: string }
  | { fase: "sin-caso" }
  | { fase: "sin-core"; mensaje: string };

export default function Recepcion({
  params,
}: {
  params: Promise<{ casoId: string }>;
}) {
  // Next 16 entrega los params como promesa incluso en cliente: `use` la
  // desenvuelve sin convertir la página en Server Component (esta necesita
  // sondeo y estado local).
  const { casoId } = use(params);

  const [vista, setVista] = useState<Vista>({ fase: "cargando" });
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const { capacidades } = useCapacidades();
  const sesion = useSesion();
  const ahora = useAhora();

  // Cuántos sondeos llevamos sin volver a probar el endpoint de 4.1.
  const sinEndpoint = useRef(false);
  const desdeLaUltimaPrueba = useRef(0);

  const cargar = useCallback(
    async (vivo: { actual: boolean }) => {
      // Se prueba 4.1 salvo que ya sepamos que no está, y aun así cada tanto:
      // el día que la desplieguen, esta pantalla se entera sola.
      const probar =
        !sinEndpoint.current ||
        desdeLaUltimaPrueba.current >= REINTENTOS_ENTRE_PRUEBAS;

      if (probar) {
        desdeLaUltimaPrueba.current = 0;
        const r = await obtenerRecepcion(casoId);
        if (!vivo.actual) return;

        if (r.estado === "ok") {
          sinEndpoint.current = false;
          setVista({ fase: "ok", paquete: r.paquete });
          return;
        }
        if (r.estado === "prohibido") {
          setVista({ fase: "prohibido", mensaje: r.mensaje });
          return;
        }
        if (r.estado === "error") {
          setVista({ fase: "sin-core", mensaje: r.mensaje });
          return;
        }

        // "ilegible" cae al camino degradado igual que "sin-endpoint": un
        // paquete que no se entiende no se pinta a medias, se reconstruye.
        sinEndpoint.current = true;
      } else {
        desdeLaUltimaPrueba.current += 1;
      }

      const alterno = await recepcionDesdeEstado(casoId, nombresServicios);
      if (!vivo.actual) return;

      if (alterno.estado === "ok") setVista({ fase: "ok", paquete: alterno.paquete });
      else if (alterno.estado === "sin-caso") setVista({ fase: "sin-caso" });
      else setVista({ fase: "sin-core", mensaje: alterno.mensaje });
    },
    [casoId],
  );

  useEffect(() => {
    const vivo = { actual: true };
    const inicial = setTimeout(() => void cargar(vivo), 0);
    const id = setInterval(() => void cargar(vivo), SONDEO_MS);

    return () => {
      vivo.actual = false;
      clearTimeout(inicial);
      clearInterval(id);
    };
  }, [cargar]);

  /**
   * Confirmar un ítem.
   *
   * Sin pintado optimista: la casilla NO se marca hasta que core devuelve
   * quién confirmó y cuándo. Un ✓ que aparece solo y luego falla en silencio
   * deja al hospital creyendo que la sala está lista.
   */
  async function confirmar(itemId: string) {
    setEnCurso(itemId);
    setAviso(null);

    const r = await confirmarItem(casoId, itemId);
    setEnCurso(null);

    if (r.estado === "ok") {
      setVista((previa) =>
        previa.fase === "ok"
          ? {
              fase: "ok",
              paquete: {
                ...previa.paquete,
                checklist: previa.paquete.checklist.map((i) =>
                  i.id === r.item.id ? r.item : i,
                ),
              },
            }
          : previa,
      );
      return;
    }

    setAviso(
      r.estado === "sin-endpoint"
        ? "core todavía no registra confirmaciones de preparación (tarea 4.1). NO se guardó nada: coordine por los canales de siempre."
        : r.estado === "prohibido"
          ? `core rechazó la confirmación: ${r.mensaje}`
          : `No se pudo confirmar: ${r.mensaje}. Nada quedó registrado.`,
    );
  }

  if (vista.fase === "cargando") return <Marco><Cargando /></Marco>;
  if (vista.fase === "sin-caso") return <Marco><SinCaso casoId={casoId} /></Marco>;
  if (vista.fase === "prohibido")
    return <Marco><Prohibido mensaje={vista.mensaje} /></Marco>;
  if (vista.fase === "sin-core")
    return <Marco><SinCore mensaje={vista.mensaje} /></Marco>;

  const { paquete } = vista;
  const cuenta = cuentaLlegada(paquete.eta, ahora);
  const rotulo = rotularEta(paquete.eta, capacidades?.ruteo);
  const ventana = estadoVentana(paquete.ventana, ahora);
  const progreso = progresoPreparacion(paquete.checklist, cuenta.restanteS);
  const huecos = huecosDe(paquete, {
    canalEnVivo: false, // el canal caso:{id} llega con 3.9
    ruteo: capacidades?.ruteo,
  });

  // Cortesía, no autorización: ver el comentario de cabecera. En modo legacy
  // `alcanza` devuelve true siempre —no hay sede en la sesión con la que
  // comparar— y bloquear ahí dejaría fuera al jefe de urgencias de verdad.
  const deOtraSede =
    paquete.sedeCodigo !== null && !sesion.alcanza(paquete.sedeCodigo);

  if (deOtraSede) {
    return (
      <Marco>
        <Prohibido
          mensaje={`Este prearribo es de la sede ${paquete.sedeNombre ?? paquete.sedeCodigo}, y tu sesión no la cubre.`}
        />
      </Marco>
    );
  }

  return (
    <Marco>
      <CabeceraPrearribo paquete={paquete} cuenta={cuenta} rotulo={rotulo} />

      <TresRelojes
        cuenta={cuenta}
        rotulo={rotulo}
        ventana={paquete.ventana}
        estado={ventana}
        progreso={progreso}
      />

      {aviso && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-[color:var(--color-critico)]/50 bg-[color:var(--color-critico)]/10 p-4 text-sm"
        >
          <span aria-hidden>▲</span>
          <span className="flex-1">{aviso}</span>
          <button
            onClick={() => setAviso(null)}
            aria-label="Cerrar aviso"
            className="shrink-0 px-2 text-[color:var(--color-texto-tenue)]"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <BloqueSbar sbar={paquete.sbar} />
        <ChecklistPreparacion
          items={paquete.checklist}
          enCurso={enCurso}
          puedeConfirmar={sesion.tiene("jefe_urgencias")}
          motivoBloqueo={
            sesion.tiene("jefe_urgencias")
              ? null
              : "Tu sesión no tiene el rol de jefatura de urgencias, así que no puede firmar la preparación. Quien confirme queda registrado con su nombre."
          }
          ahora={ahora}
          onConfirmar={(id) => void confirmar(id)}
        />
      </div>

      <HuecosDeclarados huecos={huecos} />
    </Marco>
  );
}

/**
 * Marco de la pantalla.
 *
 * `max-w-[1600px]`: en un televisor de urgencias, dejar que el texto cruce
 * 2000 px de ancho obliga a barrer la cabeza para leer una línea.
 */
function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[1600px] space-y-4 p-3 sm:p-5">
      {/* La misma barra de píldoras glass del header de la landing: la marca,
          la vuelta a solicitudes y la degradación del tiempo real, dicha
          donde se mira el reloj. */}
      <div className="flex flex-wrap items-center gap-3">
        <MarcaPulso rotulo="prearribo" />
        <Link
          href="/hospital"
          className="inline-flex h-11 items-center gap-1.5 rounded-full border
                     border-borde bg-superficie/70 px-4 text-sm font-medium
                     backdrop-blur text-texto-tenue"
        >
          <ArrowLeft className="size-4 shrink-0" strokeWidth={2.2} />
          Solicitudes
        </Link>

        <span
          className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-full
                     border border-borde bg-superficie/70 px-4 backdrop-blur
                     text-[11px] sm:text-xs text-[color:var(--color-texto-tenue)]"
        >
          <Radio className="size-3.5 shrink-0" strokeWidth={2.2} />
          Sondeo cada {SONDEO_MS / 1000} s · el canal en vivo llega con la tarea 3.9
        </span>
      </div>

      {children}
    </main>
  );
}

function Cargando() {
  return (
    <div className="rounded-3xl border border-dashed border-[color:var(--color-borde)] p-12 text-center">
      <p className="latido text-lg font-semibold">Cargando el prearribo…</p>
    </div>
  );
}

function SinCaso({ casoId }: { casoId: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-[color:var(--color-borde)] p-12 text-center">
      <p className="text-lg font-semibold">Este caso no está en el estado vivo</p>
      <p className="mx-auto mt-2 max-w-xl text-sm text-[color:var(--color-texto-tenue)]">
        core no conoce el caso <code className="tabular">{casoId}</code>. Hoy el
        estado vive en un <code>Map</code> en RAM (tarea 1.2): si core se
        reinició, los casos abiertos se perdieron con él.
      </p>
    </div>
  );
}

/**
 * La pantalla del alcance.
 *
 * Dice de quién ES el prearribo pero no lo enseña: quien no es de esa sede no
 * tiene por qué ver el cuadro clínico de un paciente que no va a recibir.
 */
function Prohibido({ mensaje }: { mensaje: string }) {
  return (
    <div className="rounded-3xl border border-[color:var(--color-alerta)]/50 bg-[color:var(--color-alerta)]/10 p-12 text-center">
      <p className="text-lg font-semibold text-[color:var(--color-alerta)]">
        Este prearribo no es de tu sede
      </p>
      <p className="mx-auto mt-2 max-w-xl text-sm text-[color:var(--color-texto-tenue)]">
        {mensaje}
      </p>
    </div>
  );
}

function SinCore({ mensaje }: { mensaje: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-[color:var(--color-critico)]/50 p-12 text-center">
      <p className="text-lg font-semibold text-[color:var(--color-critico)]">
        Sin conexión con core
      </p>
      <p className="mx-auto mt-2 max-w-xl text-sm text-[color:var(--color-texto-tenue)]">
        {mensaje}. La pantalla sigue reintentando cada {SONDEO_MS / 1000}{" "}
        segundos. Lo que se ve arriba puede estar viejo: no tome decisiones de
        preparación contra esta pantalla hasta que vuelva.
      </p>
    </div>
  );
}
