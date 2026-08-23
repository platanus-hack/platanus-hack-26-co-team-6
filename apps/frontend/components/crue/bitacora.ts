/**
 * Bitácora de acciones del regulador.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  YA NO VIVE SOLO EN EL NAVEGADOR — tarea 3.2
 * ═══════════════════════════════════════════════════════════════════
 *  Esto guardaba en `localStorage` las justificaciones de override, los
 *  reenvíos y las ampliaciones de perímetro, y lo rotulaba "registro local".
 *  Era lo honesto mientras core no tuviera dónde ponerlas — pero **un
 *  override del CRUE es una decisión con potestad legal**, y guardarla en el
 *  navegador de quien la tomó significa que se pierde al limpiar la caché y
 *  que nadie más puede verla nunca.
 *
 *  Ahora cada acción se manda a `POST /casos/:id/eventos` y queda en
 *  `evento_caso`, append-only, con el actor de la sesión — no con el nombre
 *  que el regulador escribió en un campo.
 *
 *  **`localStorage` se queda como respaldo**, y eso no es duplicación: si
 *  core no responde, el regulador está tomando la decisión igual y el
 *  registro no puede evaporarse. Lo que se guarda local se marca
 *  `pendiente: true` y la UI lo dice.
 */

import * as api from "@/lib/api";

export interface EventoBitacora {
  id: string;
  ts: string; // ISO 8601
  casoId: string;
  tipo: "override" | "siguiente" | "perimetro";
  texto: string;
  regulador: string;
  /** true = no llegó al servidor. Vive solo en este navegador. */
  pendiente?: boolean;
}

const LLAVE = "crue-bitacora";
const MAX_EVENTOS = 200;

/**
 * Los tres tipos de la UI contra los del catálogo de `evento_caso`.
 *
 * `siguiente` y `perimetro` también son overrides: el regulador está
 * cambiando a mano lo que el ranking decidió. Se distinguen en el detalle,
 * no en el tipo, porque el catálogo de eventos es de dominio y no de UI.
 */
const ACCION: Record<EventoBitacora["tipo"], string> = {
  override: "salto de regla dura",
  siguiente: "despacho manual a otra sede",
  perimetro: "ampliación del perímetro",
};

function leerTodo(): EventoBitacora[] {
  try {
    const crudo = localStorage.getItem(LLAVE);
    return crudo ? (JSON.parse(crudo) as EventoBitacora[]) : [];
  } catch {
    return [];
  }
}

function guardarLocal(evento: EventoBitacora): void {
  try {
    const todos = [...leerTodo(), evento].slice(-MAX_EVENTOS);
    localStorage.setItem(LLAVE, JSON.stringify(todos));
  } catch {
    // Sin storage (modo privado, etc.): el evento vive solo en memoria/UI.
  }
}

/**
 * Registra la acción en core y, pase lo que pase, en el navegador.
 *
 * Devuelve enseguida el evento local para que la UI lo pinte sin esperar: el
 * regulador acaba de tomar una decisión y la lista tiene que reflejarla ya.
 * La marca de `pendiente` se corrige sola cuando core confirma.
 */
export function registrarEvento(
  evento: Omit<EventoBitacora, "id" | "ts">,
): EventoBitacora {
  const completo: EventoBitacora = {
    ...evento,
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    pendiente: true,
  };

  guardarLocal(completo);

  void api
    .registrarEventoCaso(evento.casoId, {
      tipo: "override_crue",
      // La clave es el id local: reintentar desde otra pestaña o tras un
      // refresh no duplica la decisión en el acta.
      claveIdempotencia: completo.id,
      detalle: {
        accion: ACCION[evento.tipo],
        // El servidor exige justificación no vacía en un override — es lo
        // que lo separa de saltarse una regla (invariante 2 de §5.3).
        justificacion: evento.texto,
        // Se manda por trazabilidad de UI, pero **la firma es el actor de la
        // sesión**: core ignora cualquier identidad que venga en el cuerpo.
        reguladorDeclarado: evento.regulador,
      },
    })
    .then(() => {
      const todos = leerTodo().map((e) =>
        e.id === completo.id ? { ...e, pendiente: false } : e,
      );
      try {
        localStorage.setItem(LLAVE, JSON.stringify(todos));
      } catch {
        /* sin storage: la UI ya lo tiene en memoria */
      }
    })
    .catch(() => {
      // Se queda `pendiente: true` y la lista lo muestra. No se reintenta en
      // bucle: si core está caído, el regulador tiene cosas más urgentes que
      // una barra de reintentos parpadeando.
    });

  return completo;
}

export function listarEventos(casoId?: string): EventoBitacora[] {
  const todos = leerTodo();
  return casoId ? todos.filter((e) => e.casoId === casoId) : todos;
}
