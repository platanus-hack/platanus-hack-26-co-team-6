/**
 * De donde salen los actores — tarea 1.3.
 *
 * ⚠️ HOY VIVEN EN MEMORIA, SEMBRADOS DESDE EL ENTORNO.
 *    La tabla `actor` la crea la migracion de identidad (tarea 1.1, Zaid) y
 *    todavia no existe. Para no bloquear a las 12 tareas que dependen de
 *    esta, el repositorio es una interfaz con una implementacion en memoria:
 *    cuando 1.1 aterrice, se agrega `RepoActoresPostgres` y **ninguna ruta
 *    cambia**.
 *
 *    Lo que NO se hizo: dejar entrar a cualquiera mientras tanto. Sin
 *    semilla configurada no hay actores, y el unico camino es el modo legado
 *    con la contraseña de turno, que es explicito y esta declarado.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { hashear } from './contrasena';
import { esRol, type Rol } from './roles';

export interface ActorRegistrado {
  id: string;
  /** Correo o documento. Unico. Es lo que se escribe en el login. */
  identificador: string;
  nombre: string;
  organizacionId: string;
  roles: Rol[];
  /** Codigos de sede REPS. Vacio = toda la organizacion. */
  sedes: string[];
  tipo: 'humano' | 'servicio';
  hash: string;
  activo: boolean;
}

export interface RepoActores {
  porIdentificador(identificador: string): Promise<ActorRegistrado | undefined>;
  porId(id: string): Promise<ActorRegistrado | undefined>;
  /** Reemplaza el hash tras un rehash o un cambio de contraseña. */
  guardarHash(id: string, hash: string): Promise<void>;
}

@Injectable()
export class RepoActoresMemoria implements RepoActores, OnModuleInit {
  private readonly log = new Logger(RepoActoresMemoria.name);
  private readonly porCorreo = new Map<string, ActorRegistrado>();
  private readonly porUuid = new Map<string, ActorRegistrado>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.sembrar();
  }

  // Estas tres devuelven Promise sin ser `async` a proposito: hoy leen un
  // Map y no esperan nada, pero la interfaz es asincrona porque la version
  // Postgres (tras 1.1) si lo sera. Cambiar la firma entonces obligaria a
  // tocar cada llamador.
  porIdentificador(
    identificador: string,
  ): Promise<ActorRegistrado | undefined> {
    return Promise.resolve(this.porCorreo.get(normalizar(identificador)));
  }

  porId(id: string): Promise<ActorRegistrado | undefined> {
    return Promise.resolve(this.porUuid.get(id));
  }

  guardarHash(id: string, hash: string): Promise<void> {
    const actor = this.porUuid.get(id);
    if (actor) actor.hash = hash;
    return Promise.resolve();
  }

  /** Para los tests y para la semilla. No es una ruta: nadie se crea solo. */
  async registrar(
    actor: Omit<ActorRegistrado, 'id' | 'hash' | 'activo'> & {
      id?: string;
      clave: string;
      activo?: boolean;
    },
  ): Promise<ActorRegistrado> {
    const registrado: ActorRegistrado = {
      id: actor.id ?? randomUUID(),
      identificador: normalizar(actor.identificador),
      nombre: actor.nombre,
      organizacionId: actor.organizacionId,
      roles: actor.roles,
      sedes: actor.sedes,
      tipo: actor.tipo,
      hash: await hashear(actor.clave),
      activo: actor.activo ?? true,
    };
    this.porCorreo.set(registrado.identificador, registrado);
    this.porUuid.set(registrado.id, registrado);
    return registrado;
  }

  /**
   * Semilla desde el entorno:
   *
   *   PULSO_ACTORES=correo:clave:organizacion:rol|rol:sede,sede;otro:...
   *
   * Formato feo a proposito: es temporal y no quiero que nadie lo confunda
   * con una forma de administrar usuarios. Los usuarios de verdad los crea
   * la invitacion (§3.5) sobre la tabla de 1.1.
   */
  private async sembrar(): Promise<void> {
    const crudo = this.config.get<string>('PULSO_ACTORES');
    if (!crudo) {
      this.log.warn(
        'Sin PULSO_ACTORES: no hay actores individuales. El login solo ' +
          'funcionara en modo legado (contraseña de turno). La tabla `actor` ' +
          'llega con la migracion de identidad (tarea 1.1).',
      );
      return;
    }

    for (const linea of crudo.split(';').filter(Boolean)) {
      const [identificador, clave, organizacionId, roles, sedes] =
        linea.split(':');
      if (!identificador || !clave || !organizacionId || !roles) {
        this.log.error(`PULSO_ACTORES: entrada mal formada, se ignora`);
        continue;
      }

      const listaRoles = roles.split('|').filter(esRol);
      if (!listaRoles.length) {
        this.log.error(
          `PULSO_ACTORES: '${identificador}' sin ningun rol valido, se ignora`,
        );
        continue;
      }

      try {
        await this.registrar({
          identificador,
          nombre: identificador,
          organizacionId,
          roles: listaRoles,
          sedes: sedes ? sedes.split(',').filter(Boolean) : [],
          tipo: 'humano',
          clave,
        });
      } catch (e) {
        // El caso tipico: clave de menos de 12 caracteres. Se dice cual
        // entrada fallo, nunca la clave.
        this.log.error(
          `PULSO_ACTORES: '${identificador}' no se sembro — ${String(
            (e as Error).message,
          )}`,
        );
      }
    }

    this.log.log(
      `${this.porUuid.size} actor(es) sembrados desde PULSO_ACTORES ` +
        '(en memoria: se pierden al reiniciar).',
    );
  }
}

const normalizar = (identificador: string): string =>
  identificador.trim().toLowerCase();

/** Ruido para comparar contra un hash inexistente. Ver el login. */
export const HASH_SENUELO = `$scrypt$N=32768,r=8,p=3$${randomBytes(16).toString(
  'base64',
)}$${randomBytes(32).toString('base64')}`;
