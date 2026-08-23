"use client";

/**
 * El puente entre `lib/capacidad-modelo.ts` (las reglas) y la pantalla.
 *
 * Aquí solo vive lo que no se puede probar sin navegador: el reloj, el
 * agrupamiento de toques y las condiciones de carrera. Todo lo que decide algo
 * —qué se pinta, qué se revierte, cómo se rotula— está en el modelo, con tests.
 *
 * ── LAS TRES COSAS QUE ESTE ARCHIVO RESUELVE ──────────────────────
 *
 *  1. **Cada control guarda solo.** No hay botón de "Guardar": tocar un estado
 *     o un `+` dispara su propia escritura. El `+` se agrupa 700 ms porque a
 *     las 3 a.m. nadie sube de 2 a 9 camas con una pausa entre toques, y
 *     mandar siete PUT seguidos es siete oportunidades de que uno falle a
 *     mitad y deje la fila en un número que nadie eligió.
 *
 *  2. **La respuesta vieja no pisa el toque nuevo.** Si el humano vuelve a
 *     tocar mientras la escritura anterior va en camino, la que llega tarde se
 *     descarta. Sin esto, el número salta atrás solo — el peor bug posible en
 *     una pantalla que se usa con prisa y sin mirar dos veces.
 *
 *  3. **Un fallo revierte y se ve.** Nunca se traga. La sede que cree haber
 *     declarado contingencia y sigue recibiendo pacientes es exactamente el
 *     final que esta vista existe para impedir.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  declararCamas,
  declararEstado,
  leerCapacidad,
  mensajeDeFallo,
} from "@/lib/api-capacidad";
import {
  CAPACIDAD_INICIAL,
  claveCama,
  proyectar,
  reducirCapacidad,
  type Clave,
  type EstadoOperativo,
  type ValorEnVuelo,
  type VistaCapacidad,
} from "@/lib/capacidad-modelo";

/** Cada cuánto se repinta el reloj. La caducidad se muestra en minutos: un
 *  segundero obligaría a repintar 30 veces más para no decir nada nuevo. */
const TICK_MS = 20_000;

/** Cada cuánto se relee la declaración. Otro jefe de turno puede declarar
 *  desde otra pantalla, y enterarse cinco minutos después no sirve. */
const REFRESCO_MS = 20_000;

/** Cuánto se esperan más toques antes de mandar la fila de camas. */
const AGRUPAR_MS = 700;

export interface Declarador {
  vista: VistaCapacidad;
  cargando: boolean;
  /** Un toque. Si el estado exige motivo, quien llama ya lo tiene que traer. */
  declararOperativo: (estado: EstadoOperativo, motivo: string | null) => void;
  /** El `−` y el `+`. Se pinta ya; se manda agrupado. */
  fijarCamas: (tipo: string, disponibles: number) => void;
  /** Reintenta lo que se revirtió, con el mismo valor que se había puesto. */
  reintentar: (clave: Clave) => void;
  descartarAviso: (clave: Clave) => void;
  recargar: () => void;
}

export function useDeclaracion(
  sedeCodigo: string | null,
  actorId?: string | null,
): Declarador {
  const [estado, despachar] = useReducer(reducirCapacidad, CAPACIDAD_INICIAL);
  const [ahora, setAhora] = useState(() => Date.now());

  // Contador por control: solo la escritura más reciente de cada clave tiene
  // derecho a confirmar o revertir. Es un ref y no estado porque cambiarlo no
  // debe repintar nada.
  const generacion = useRef<Record<string, number>>({});
  const temporizadores = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      for (const t of Object.values(temporizadores.current)) clearTimeout(t);
      temporizadores.current = {};
    };
  }, []);

  // ── Lectura ────────────────────────────────────────────────────

  const cargar = useCallback(async () => {
    if (!sedeCodigo) {
      despachar({ tipo: "sin-declaracion", ausencia: "sin-sede" });
      return;
    }

    const lectura = await leerCapacidad(sedeCodigo);
    if (!vivo.current) return;

    if (lectura.hay) despachar({ tipo: "cargada", declaracion: lectura.declaracion });
    else despachar({ tipo: "sin-declaracion", ausencia: lectura.ausencia });
  }, [sedeCodigo]);

  useEffect(() => {
    despachar({ tipo: "cargando" });
    void cargar();
  }, [cargar]);

  // El reloj corre siempre: la caducidad tiene que envejecer a la vista aunque
  // core no responda. Es el dato que impide que una contingencia de un martes
  // se quede puesta para siempre.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Releer solo tiene sentido si la última lectura trajo algo. Con core sin el
  // endpoint, repreguntar cada 20 s es una fila de 404 en los logs que no
  // cambia nada de lo que la pantalla ya dice.
  const hayBase = estado.base !== null;
  useEffect(() => {
    if (!hayBase) return;
    const id = setInterval(() => void cargar(), REFRESCO_MS);
    return () => clearInterval(id);
  }, [hayBase, cargar]);

  // ── Escritura ──────────────────────────────────────────────────

  /**
   * Manda un valor y resuelve su destino: confirmar o revertir.
   *
   * `mia` congela la generación con la que salió. Si mientras tanto hubo otro
   * toque, esta respuesta ya no manda sobre lo que se ve.
   */
  const enviar = useCallback(
    async (clave: Clave, valor: ValorEnVuelo) => {
      if (!sedeCodigo) return;

      const mia = (generacion.current[clave] ?? 0) + 1;
      generacion.current[clave] = mia;

      try {
        const declaracion =
          valor.control === "operativo"
            ? await declararEstado(sedeCodigo, {
                estado: valor.operativo,
                motivo: valor.motivo,
              })
            : await declararCamas(sedeCodigo, {
                tipo: valor.tipo,
                disponibles: valor.disponibles,
              });

        if (!vivo.current || generacion.current[clave] !== mia) return;
        despachar({ tipo: "confirmada", clave, declaracion });
      } catch (err) {
        if (!vivo.current || generacion.current[clave] !== mia) return;
        despachar({ tipo: "revertida", clave, mensaje: mensajeDeFallo(err) });
      }
    },
    [sedeCodigo],
  );

  const declararOperativo = useCallback(
    (operativo: EstadoOperativo, motivo: string | null) => {
      const valor: ValorEnVuelo = { control: "operativo", operativo, motivo };
      // Se pinta antes de salir: el toque tiene que sentirse instantáneo.
      despachar({ tipo: "escribir", valor });
      void enviar("operativo", valor);
    },
    [enviar],
  );

  const fijarCamas = useCallback(
    (tipo: string, disponibles: number) => {
      const clave = claveCama(tipo);
      const valor: ValorEnVuelo = { control: "cama", tipo, disponibles };
      despachar({ tipo: "escribir", valor });

      clearTimeout(temporizadores.current[clave]);
      temporizadores.current[clave] = setTimeout(() => {
        delete temporizadores.current[clave];
        void enviar(clave, valor);
      }, AGRUPAR_MS);
    },
    [enviar],
  );

  const reintentar = useCallback(
    (clave: Clave) => {
      const fallo = estado.revertidos[clave];
      if (!fallo) return;
      despachar({ tipo: "escribir", valor: fallo.intento });
      void enviar(clave, fallo.intento);
    },
    [estado.revertidos, enviar],
  );

  const descartarAviso = useCallback((clave: Clave) => {
    despachar({ tipo: "descartar-reversion", clave });
  }, []);

  const recargar = useCallback(() => {
    despachar({ tipo: "cargando" });
    void cargar();
  }, [cargar]);

  return {
    vista: proyectar(estado, ahora, actorId),
    cargando: estado.cargando,
    declararOperativo,
    fijarCamas,
    reintentar,
    descartarAviso,
    recargar,
  };
}
