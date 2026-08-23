"use client";

/**
 * Por qué esta sede no puede recibir.
 *
 * No es un "motivo de rechazo": es una DECLARACIÓN DE CAPACIDAD, y la
 * diferencia no es de vocabulario. La Ley 1751/2015 obliga a la atención
 * inicial de urgencias sin autorización previa, así que ningún hospital está
 * negando atención aquí — está reportando que no tiene con qué resolver este
 * caso, con fecha y hora.
 *
 * Cada una de estas respuestas alimenta el índice de congestión de la sede.
 * Es el sensor del producto: el jefe de urgencias no tipea nada, toca el botón
 * que de todas formas iba a tocar, y la red aprende.
 *
 * Por eso son opciones cerradas y no texto libre: un campo abierto da datos
 * que nadie puede agregar.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  LOS MOTIVOS YA NO VIVEN AQUÍ — tarea 0.6
 * ═══════════════════════════════════════════════════════════════════
 *  Estaban escritos en este archivo y viajaban como TEXTO LIBRE. Bastaba
 *  que alguien corrigiera una palabra para partir en dos la serie histórica
 *  de aceptación: "Urgencias en capacidad máxima" y "Urgencias saturadas"
 *  son la misma causa y dos claves distintas al agrupar.
 *
 *  Ahora se piden a core (`GET /catalogo/motivos-rechazo`), se guarda el
 *  `codigo` —inmutable— y se pinta la `etiqueta` —editable—. La lista de
 *  abajo se queda SOLO como respaldo para cuando core no responde: la regla
 *  del repo es degradar y decirlo, y aquí decirlo importa más que en otros
 *  sitios, porque un motivo perdido es una fila menos del dataset.
 * ═══════════════════════════════════════════════════════════════════
 */

import { useEffect, useState } from "react";
import type { MotivoRechazoCatalogo } from "@/lib/types";
import * as api from "@/lib/api";

/**
 * Respaldo sin core. Mismos códigos que la semilla de
 * `core/src/catalogo/motivos-rechazo.ts` — si se cambian allá, se cambian
 * aquí, y por eso la lista es corta a propósito.
 */
const RESPALDO: MotivoRechazoCatalogo[] = [
  {
    codigo: "SIN_CAMAS_UCI",
    etiqueta: "Sin camas UCI disponibles",
    categoria: "capacidad",
    version: 1,
  },
  {
    codigo: "HEMODINAMIA_OCUPADA",
    etiqueta: "Sala de hemodinamia en procedimiento",
    categoria: "tecnico",
    version: 1,
  },
  {
    codigo: "URGENCIAS_SATURADAS",
    etiqueta: "Urgencias en capacidad máxima",
    categoria: "capacidad",
    version: 1,
  },
  {
    codigo: "SIN_ESPECIALISTA",
    etiqueta: "Sin especialista de turno",
    categoria: "recurso_humano",
    version: 1,
  },
  {
    codigo: "SIN_CLARIDAD_PAGADOR",
    etiqueta: "Sin claridad del pagador",
    categoria: "administrativo",
    version: 2,
  },
];

/**
 * Se pide una vez por sesión de pestaña y se comparte entre tarjetas.
 *
 * Sin esto, cada solicitud pendiente que abre el selector dispara su propia
 * petición: en una noche saturada son varias por minuto para una lista que
 * cambia una vez al trimestre.
 */
let cacheMotivos: MotivoRechazoCatalogo[] | null = null;

export function MotivosCapacidad({
  onElegir,
  onCancelar,
}: {
  /** Se manda el código (lo que se agrega) y la etiqueta que se vio. */
  onElegir: (codigo: string, etiqueta: string) => void;
  onCancelar: () => void;
}) {
  const [motivos, setMotivos] = useState<MotivoRechazoCatalogo[]>(
    cacheMotivos ?? RESPALDO,
  );
  const [degradado, setDegradado] = useState(cacheMotivos === null);

  useEffect(() => {
    if (cacheMotivos) return;
    let vivo = true;

    void api
      .catalogoMotivosRechazo()
      .then((r) => {
        cacheMotivos = r.motivos;
        if (!vivo) return;
        setMotivos(r.motivos);
        setDegradado(false);
      })
      // No se rompe la pantalla por esto: el jefe de urgencias tiene una
      // solicitud de 45 segundos en la mano. Se responde con el respaldo y
      // se dice que se está respondiendo con el respaldo.
      .catch(() => vivo && setDegradado(true));

    return () => {
      vivo = false;
    };
  }, []);

  return (
    <div className="space-y-2">
      <p className="text-xs text-[color:var(--color-texto-tenue)]">
        Declaración de capacidad. Queda auditada con fecha y hora.
      </p>

      {motivos.map((m) => (
        <button
          key={m.codigo}
          onClick={() => onElegir(m.codigo, m.etiqueta)}
          className="w-full px-3 rounded-lg text-sm text-left
                     bg-[color:var(--color-superficie-alta)]
                     border border-[color:var(--color-borde)]"
        >
          {m.etiqueta}
        </button>
      ))}

      {degradado && (
        <p className="text-[11px] text-[color:var(--color-alerta)]">
          Sin catálogo de core: lista de respaldo. El motivo se registra igual.
        </p>
      )}

      <button
        onClick={onCancelar}
        className="w-full text-xs text-[color:var(--color-texto-tenue)]"
      >
        Volver
      </button>
    </div>
  );
}
