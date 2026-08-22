/**
 * Bitácora local de acciones del regulador.
 *
 * Core aún no tiene un endpoint de eventos (propuesto: POST /eventos, carril
 * de Sebas). Hasta entonces las justificaciones de override, reenvíos y
 * ampliaciones de perímetro se registran AQUÍ (localStorage) y la UI las
 * rotula "registro local": trazables en el navegador del regulador, no en el
 * servidor. Cuando exista el endpoint, este módulo es lo único que cambia.
 */

export interface EventoBitacora {
  id: string;
  ts: string; // ISO 8601
  casoId: string;
  tipo: "override" | "siguiente" | "perimetro";
  texto: string;
  regulador: string;
}

const LLAVE = "crue-bitacora";
const MAX_EVENTOS = 200;

function leerTodo(): EventoBitacora[] {
  try {
    const crudo = localStorage.getItem(LLAVE);
    return crudo ? (JSON.parse(crudo) as EventoBitacora[]) : [];
  } catch {
    return [];
  }
}

export function registrarEvento(
  evento: Omit<EventoBitacora, "id" | "ts">,
): EventoBitacora {
  const completo: EventoBitacora = {
    ...evento,
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
  };
  try {
    const todos = [...leerTodo(), completo].slice(-MAX_EVENTOS);
    localStorage.setItem(LLAVE, JSON.stringify(todos));
  } catch {
    // Sin storage (modo privado, etc.): el evento vive solo en memoria/UI.
  }
  return completo;
}

export function listarEventos(casoId?: string): EventoBitacora[] {
  const todos = leerTodo();
  return casoId ? todos.filter((e) => e.casoId === casoId) : todos;
}
