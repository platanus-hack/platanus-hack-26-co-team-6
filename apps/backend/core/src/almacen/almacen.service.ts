/**
 * Almacén en memoria.
 *
 * Existe para que TODO el flujo corra sin Supabase configurado. Cuando la DB
 * esté lista, SedesService lee de allá y esto queda como estado de sesión
 * (casos y handshakes vivos del demo).
 *
 * ⚠️ YA NO ES SOLO MEMORIA (tarea 1.2). Es una CACHÉ EN PROCESO con
 * write-through a `RepositorioPulso`: se hidrata al arrancar y cada escritura
 * va también al repositorio, sin bloquear.
 *
 * Las lecturas siguen siendo SÍNCRONAS a propósito. Dieciséis archivos
 * consumen esta clase; volverlas async los rompería a todos de golpe. La
 * decisión, con su costo, está explicada en `repositorios/repositorio.ts`.
 *
 * Limitación que SIGUE en pie: no se comparte entre instancias. Cada réplica
 * tiene su caché y ve lo que había al arrancar más lo que escribió ella. Es
 * mejor que antes —donde una réplica no veía NUNCA lo de la otra— pero no es
 * multi-instancia de verdad. Eso es la tarea 3.8.
 *
 * Como Nest instancia los providers una sola vez, ya no hace falta el truco
 * de colgarse de `globalThis` que exigía el hot-reload de Next.
 */

import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import type { Caso, Escalamiento, Handshake } from '../contracts/types';
import { MemoriaRepositorio } from '../repositorios/memoria.repositorio';
import { REPOSITORIO, type RepositorioPulso } from '../repositorios/repositorio';

interface Historial {
  aceptados: number;
  rechazados: number;
}

@Injectable()
export class AlmacenService implements OnModuleInit {
  /**
   * El default de memoria NO es un adorno: varios specs hacen
   * `new AlmacenService()` directo, sin el contenedor de Nest. Sin él, esta
   * tarea obligaría a tocar cada uno de esos tests — que es justo lo que la
   * 1.2 advierte que vuelve el PR inmergeable.
   */
  constructor(
    // @Optional() es lo que hace que el default de TypeScript sirva: sin él,
    // Nest EXIGE el token aunque haya valor por defecto, y cualquier
    // TestingModule que arme AlmacenService sin importar RepositoriosModule
    // deja de compilar el contenedor. Son decenas de specs.
    @Optional()
    @Inject(REPOSITORIO)
    private readonly repo: RepositorioPulso = new MemoriaRepositorio(),
  ) {}

  /**
   * Hidrata la caché desde el repositorio al arrancar.
   *
   * Si falla, el servicio arranca igual con la caché vacía: un core que no
   * levanta es peor que uno sin historia. Se avisa fuerte porque perder la
   * hidratación en silencio se ve exactamente igual que una base vacía.
   */
  async onModuleInit(): Promise<void> {
    try {
      const { casos, handshakes } = await this.repo.cargar();
      for (const c of casos) this.casos.set(c.id, c);
      for (const h of handshakes) {
        this.handshakes.set(h.id, h);
        // El historial y la ventana de rechazos son PROYECCIONES sobre los
        // handshakes, no estado aparte. Reconstruirlas al hidratar es lo que
        // hace que pAceptacion sobreviva al reinicio.
        this.proyectar(h);
      }
      this.log.log(
        `Hidratado desde ${this.repo.clase}: ${casos.length} casos, ` +
          `${handshakes.length} handshakes.`,
      );
    } catch (e) {
      this.log.error(
        `No pude hidratar desde ${this.repo.clase}, arranco con la caché ` +
          `vacía: ${String(e)}`,
      );
    }
  }

  /** Reconstruye historial, ventana de rechazos y latencias desde un handshake. */
  private proyectar(h: Handshake): void {
    if (h.estado !== 'aceptado' && h.estado !== 'rechazado') return;
    const previo = this.historial.get(h.sedeCodigo) ?? { aceptados: 0, rechazados: 0 };
    if (h.estado === 'aceptado') previo.aceptados += 1;
    else previo.rechazados += 1;
    this.historial.set(h.sedeCodigo, previo);

    if (h.estado === 'rechazado' && h.respondidoEn) {
      const lista = this.rechazosRecientes.get(h.sedeCodigo) ?? [];
      lista.push(h.respondidoEn);
      this.rechazosRecientes.set(h.sedeCodigo, lista);
    }
    if (typeof h.latenciaS === 'number' && h.latenciaS >= 0) {
      const lista = this.latenciasRespuesta.get(h.sedeCodigo) ?? [];
      lista.push(h.latenciaS);
      this.latenciasRespuesta.set(h.sedeCodigo, lista);
    }
  }

  /**
   * Escribe en el repositorio sin bloquear al que llamó.
   *
   * Las lecturas de `AlmacenService` son SÍNCRONAS y las consumen dieciséis
   * archivos. Esperar a Postgres en cada escritura obligaría a volver async
   * toda la superficie. Por eso se dispara y se registra el fallo: si la
   * escritura falla, la caché ya tiene el dato y el turno sigue — lo que se
   * pierde es la durabilidad de ESA fila, y queda en el log.
   */
  private persistir(promesa: Promise<void>, que: string): void {
    void promesa.catch((e) =>
      this.log.error(`no pude persistir ${que}: ${String(e)}`),
    );
  }

  private readonly log = new Logger(AlmacenService.name);

  private readonly casos = new Map<string, Caso>();
  private readonly handshakes = new Map<string, Handshake>();
  private readonly escalamientos = new Map<string, Escalamiento>();
  /** sedeCodigo → { aceptados, rechazados } — alimenta P(aceptación) */
  private readonly historial = new Map<string, Historial>();
  /** sedeCodigo → timestamps ISO de rechazos, para la ventana de 6h */
  private readonly rechazosRecientes = new Map<string, string[]>();
  /** sedeCodigo → segundos que tardó en responder cada handshake */
  private readonly latenciasRespuesta = new Map<string, number[]>();

  // ── Casos ──────────────────────────────────────────────────────

  guardarCaso(caso: Caso): Caso {
    this.casos.set(caso.id, caso);
    this.persistir(this.repo.guardarCaso(caso), `caso ${caso.id}`);
    return caso;
  }

  obtenerCaso(id: string): Caso | undefined {
    return this.casos.get(id);
  }

  listarCasos(): Caso[] {
    return [...this.casos.values()].sort((a, b) =>
      b.creadoEn.localeCompare(a.creadoEn),
    );
  }

  // ── Handshakes ─────────────────────────────────────────────────

  guardarHandshake(h: Handshake): Handshake {
    this.handshakes.set(h.id, h);
    this.persistir(this.repo.guardarHandshake(h), `handshake ${h.id}`);
    return h;
  }

  obtenerHandshake(id: string): Handshake | undefined {
    return this.handshakes.get(id);
  }

  listarHandshakes(casoId?: string): Handshake[] {
    const todos = [...this.handshakes.values()];
    const filtrados = casoId ? todos.filter((h) => h.casoId === casoId) : todos;
    return filtrados.sort((a, b) => b.enviadoEn.localeCompare(a.enviadoEn));
  }

  /** Handshakes que siguen esperando respuesta. Los pinta la consola del hospital. */
  handshakesPendientes(): Handshake[] {
    return this.listarHandshakes().filter((h) => h.estado === 'enviado');
  }

  // Aquí vivió un barrido perezoso que vencía solicitudes al leerlas. Lo
  // reemplaza VigilanteService, que hace lo mismo con un @Interval y además
  // re-rutea al siguiente candidato. Dos mecanismos venciendo el mismo
  // handshake es peor que cualquiera de los dos por separado.

  // ── Escalamientos al CRUE ──────────────────────────────────────

  guardarEscalamiento(e: Escalamiento): Escalamiento {
    this.escalamientos.set(e.id, e);
    return e;
  }

  obtenerEscalamiento(id: string): Escalamiento | undefined {
    return this.escalamientos.get(id);
  }

  /** Escalamiento abierto de un caso, si lo hay. Evita duplicarlos. */
  escalamientoAbiertoDe(casoId: string): Escalamiento | undefined {
    return [...this.escalamientos.values()].find(
      (e) => e.casoId === casoId && e.atendidoEn === null,
    );
  }

  listarEscalamientos(casoId?: string): Escalamiento[] {
    const todos = [...this.escalamientos.values()];
    const filtrados = casoId ? todos.filter((e) => e.casoId === casoId) : todos;
    return filtrados.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  }

  // ── Historial de aceptación — el dataset que se auto-etiqueta ───

  /**
   * ⭐ Aquí está el corazón del producto: cada respuesta de un hospital queda
   * registrada y se convierte en el prior de la siguiente decisión. Nadie
   * tipeó nada. El rechazo ES el sensor.
   */
  registrarRespuesta(
    sedeCodigo: string,
    decision: 'aceptado' | 'rechazado',
    latenciaS?: number | null,
  ): void {
    const h = this.historial.get(sedeCodigo) ?? { aceptados: 0, rechazados: 0 };
    if (decision === 'aceptado') h.aceptados += 1;
    else h.rechazados += 1;
    this.historial.set(sedeCodigo, h);

    if (decision === 'rechazado') {
      const lista = this.rechazosRecientes.get(sedeCodigo) ?? [];
      lista.push(new Date().toISOString());
      this.rechazosRecientes.set(sedeCodigo, lista);
    }

    // Cuánto tardó en contestar es la mitad medible del costo de rebotarla.
    // Ver penalizacionRebote() en scoring.service.ts.
    if (typeof latenciaS === 'number' && latenciaS >= 0) {
      const lista = this.latenciasRespuesta.get(sedeCodigo) ?? [];
      lista.push(latenciaS);
      this.latenciasRespuesta.set(sedeCodigo, lista);
    }
  }

  /** Minutos que esta sede ha tardado en responder handshakes anteriores. */
  latenciasRespuestaMin(sedeCodigo: string): number[] {
    return (this.latenciasRespuesta.get(sedeCodigo) ?? []).map((s) => s / 60);
  }

  historialSede(sedeCodigo: string): Historial {
    return this.historial.get(sedeCodigo) ?? { aceptados: 0, rechazados: 0 };
  }

  /** Cuántos rechazos acumula esta sede en las últimas `horas`. */
  rechazosEnVentana(sedeCodigo: string, horas = 6): number {
    const lista = this.rechazosRecientes.get(sedeCodigo) ?? [];
    const corte = Date.now() - horas * 3_600_000;
    return lista.filter((iso) => new Date(iso).getTime() >= corte).length;
  }

  /** Solo para el demo: dejar todo limpio antes de subir al escenario. */
  reiniciarTodo(): void {
    this.casos.clear();
    this.handshakes.clear();
    this.escalamientos.clear();
    this.historial.clear();
    this.rechazosRecientes.clear();
    this.latenciasRespuesta.clear();
    this.persistir(this.repo.limpiar(), 'el borrado');
  }
}
