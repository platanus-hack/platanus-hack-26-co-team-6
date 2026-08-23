/**
 * Límite de tasa por IP, en memoria, sin dependencias.
 *
 * ── POR QUÉ HACE FALTA ────────────────────────────────────────────
 * `POST /afiliacion/verificar` es público y contesta "esta sede existe / no
 * existe" sobre un catálogo de 16.181 registros. Eso lo convierte en un
 * enumerador del REPS: un bucle de doce dígitos reconstruye el directorio
 * completo, con dirección y coordenadas, mucho más rápido que la descarga
 * oficial. El REPS es dato público, así que esto no es una fuga — es abuso de
 * un servicio que además cuesta CPU y comparte proceso con el ruteo de
 * ambulancias, que es lo que no puede quedarse sin aire.
 *
 * ── LO QUE ESTE LÍMITE NO HACE ────────────────────────────────────
 * 1. **No sirve con dos instancias.** El contador vive en el proceso. En
 *    Render con dos réplicas el techo real es el doble, y con N es N veces.
 *    Cuando haya más de una instancia esto tiene que moverse a Redis o a la
 *    misma tabla de Postgres; el día que pase, se cambia esta clase y nadie
 *    más se entera.
 * 2. **Se reinicia con el proceso.** Un despliegue perdona a quien estaba
 *    bloqueado. Es aceptable: el objetivo es frenar el bucle, no castigarlo.
 * 3. **La IP puede ser la del proxy.** Detrás de un balanceador, express
 *    devuelve la IP del salto anterior salvo que se active `trust proxy`. Si
 *    todas las peticiones llegan con la misma IP, el límite pasa a ser global
 *    — falla cerrando, que es el lado correcto en el que fallar.
 *
 * ── PII ───────────────────────────────────────────────────────────
 * La IP es la clave del mapa y nunca sale de aquí: no se loguea, no viaja en
 * la respuesta y no se persiste (regla 5 de AGENTS.md).
 */

export interface Cupo {
  /** Peticiones permitidas dentro de la ventana. */
  maximo: number;
  ventanaMs: number;
}

export interface Veredicto {
  permitido: boolean;
  restantes: number;
  /** Segundos hasta que la ventana se reinicie. Va en `Retry-After`. */
  reintentarEnS: number;
}

/**
 * Ventana fija, no deslizante: en el borde de la ventana se puede colar hasta
 * el doble del cupo. Para frenar un bucle de enumeración da igual, y una
 * ventana deslizante exige guardar cada timestamp — memoria que un atacante
 * puede hacer crecer a voluntad, que es el problema que veníamos a evitar.
 */
export class LimiteTasa {
  private readonly ventanas = new Map<
    string,
    { conteo: number; reinicioEn: number }
  >();

  /**
   * Techo de claves vivas. Un atacante que rota IPs (IPv6 le da de sobra)
   * haría crecer el mapa hasta tumbar el proceso: eso convertiría la defensa
   * en el ataque. Al pasarse, se barren las vencidas.
   */
  private static readonly MAX_CLAVES = 20_000;

  constructor(private readonly cupo: Cupo) {}

  /** Cuenta una petición y dice si pasa. `ahora` es inyectable para el test. */
  intentar(clave: string, ahora: number = Date.now()): Veredicto {
    if (this.ventanas.size > LimiteTasa.MAX_CLAVES) this.barrer(ahora);

    const actual = this.ventanas.get(clave);

    if (!actual || actual.reinicioEn <= ahora) {
      const reinicioEn = ahora + this.cupo.ventanaMs;
      this.ventanas.set(clave, { conteo: 1, reinicioEn });
      return {
        permitido: true,
        restantes: this.cupo.maximo - 1,
        reintentarEnS: Math.ceil(this.cupo.ventanaMs / 1000),
      };
    }

    actual.conteo++;
    const reintentarEnS = Math.max(
      1,
      Math.ceil((actual.reinicioEn - ahora) / 1000),
    );

    return {
      permitido: actual.conteo <= this.cupo.maximo,
      restantes: Math.max(0, this.cupo.maximo - actual.conteo),
      reintentarEnS,
    };
  }

  /** Solo para los tests: deja el contador como recién arrancado. */
  reiniciar(): void {
    this.ventanas.clear();
  }

  private barrer(ahora: number): void {
    for (const [clave, ventana] of this.ventanas) {
      if (ventana.reinicioEn <= ahora) this.ventanas.delete(clave);
    }
  }
}
