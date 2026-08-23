"use client";

/**
 * Sesión en el cliente: quién es el actor, de qué organización y con qué roles.
 *
 * Aquí está solo la capa de React. Las reglas —cómo se lee la respuesta de core,
 * qué puede hacer cada rol y a dónde va— viven en `sesion-modelo.ts`, sin React
 * y con tests.
 *
 * REGLA QUE NO SE ROMPE: aquí NUNCA se lee el token. La sesión sigue viviendo
 * en una cookie HttpOnly que este archivo no puede ver ni quiere ver — un XSS
 * en una consola no se lleva nada. Lo único que hacemos es preguntarle a core
 * "¿quién soy?" (`GET /auth/sesion`) y guardar la respuesta en memoria.
 *
 * ── DOS MODOS, Y LO DICE ───────────────────────────────────────────
 *   modo "legacy"  → { autenticado }                    la contraseña de turno
 *   modo "actor"   → { autenticado, actor, organizacion, roles, sedes }
 *
 * "legacy" es el puente que dejó la tarea 1.3 (`PULSO_AUTH_LEGACY=true`) para
 * que el demo siga entrando mientras el modelo de identidad aterriza.
 *
 * Y lo importante: esta capa NO es la seguridad. La seguridad es el guard de
 * core, que responde 401 y 403 aunque alguien borre este archivo.
 */

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as api from "./api";
import {
  alcanzaSede,
  normalizarSesion,
  tieneRol,
  type Actor,
  type DatosSesion,
  type ModoAuth,
  type Organizacion,
  type Rol,
} from "./sesion-modelo";

export * from "./sesion-modelo";

export type EstadoSesion = "cargando" | "dentro" | "fuera" | "sin-core";

export interface Sesion extends DatosSesion {
  estado: EstadoSesion;
  /** ¿Tiene alguno de estos roles? En modo legacy siempre true: no hay roles. */
  tiene: (...roles: Rol[]) => boolean;
  /** ¿Su alcance cubre esta sede? Alcance vacío = toda la organización. */
  alcanza: (codigoSede: string) => boolean;
  recargar: () => Promise<void>;
  salir: () => Promise<void>;
}

/** Centinela de "core no respondió". Un símbolo no colisiona con nada. */
const CAIDO = Symbol("core-caido");

const VACIA: Sesion = {
  ...normalizarSesion(null),
  estado: "cargando",
  tiene: () => false,
  alcanza: () => false,
  recargar: async () => {},
  salir: async () => {},
};

const Contexto = createContext<Sesion>(VACIA);

/**
 * El estado remoto de la sesión, aislado en un hook.
 *
 * Vive separado del proveedor por el mismo motivo que `useCapacidades`: la
 * carga inicial es una suscripción a un sistema externo (core), con su bandera
 * de vida para no escribir estado de un componente que ya se desmontó a mitad
 * de petición.
 *
 * Estado y datos van en UN solo `useState` a propósito. Nunca cambian por
 * separado — "dentro" sin actor o "fuera" con actor son estados imposibles — y
 * en dos `useState` cada carga dispararía dos renders en cascada.
 */
interface EstadoRemoto {
  estado: EstadoSesion;
  datos: DatosSesion;
}

function leer(crudo: unknown): EstadoRemoto {
  const datos = normalizarSesion(crudo);
  return { estado: datos.autenticado ? "dentro" : "fuera", datos };
}

function useSesionRemota() {
  const [remoto, setRemoto] = useState<EstadoRemoto>(() => ({
    estado: "cargando",
    datos: normalizarSesion(null),
  }));
  const vivoRef = useRef(true);

  const cargar = useCallback(async () => {
    // `.catch` en vez de try/catch: core caído no es una excepción que subir,
    // es un estado que pintar.
    const crudo = await api.sesion().catch(() => CAIDO);
    if (vivoRef.current) {
      setRemoto(
        crudo === CAIDO
          ? // No es lo mismo que "no tienes sesión", y no se pinta igual.
            { estado: "sin-core", datos: normalizarSesion(null) }
          : leer(crudo),
      );
    }
  }, []);

  useEffect(() => {
    vivoRef.current = true;
    void cargar();
    return () => {
      vivoRef.current = false;
    };
  }, [cargar]);

  const salir = useCallback(async () => {
    // Si el logout falla, la cookie puede seguir viva en el servidor; aun así
    // limpiamos aquí. Lo contrario deja a alguien mirando una consola que creía
    // cerrada.
    await api.logout().catch(() => undefined);
    setRemoto({ estado: "fuera", datos: normalizarSesion(null) });
  }, []);

  /** Lo llama el gancho de api.ts cuando un 401 sobrevive a la renovación. */
  const perder = useCallback(() => {
    setRemoto((previo) => ({ ...previo, estado: "fuera" }));
  }, []);

  return { ...remoto, cargar, salir, perder };
}

/** Envuelve las consolas. Una sola llamada a /auth/sesion para todas. */
export function ProveedorSesion({
  children,
  alPerder,
}: {
  children: ReactNode;
  /** Se llama cuando no hay sesión o se perdió. El layout lo usa para ir al login. */
  alPerder?: () => void;
}) {
  const { datos, estado, cargar, salir, perder } = useSesionRemota();

  // Si la sesión se cae a mitad de turno, api.ts avisa desde cualquier petición
  // y salimos de una vez, sin esperar al siguiente tick del polling.
  useEffect(() => {
    api.alPerderSesion(perder);
    return () => api.alPerderSesion(null);
  }, [perder]);

  // Solo "fuera" manda al login. "sin-core" NO: mandar al login a quien tiene
  // un paciente en la camilla porque una petición no llegó lo deja mirando una
  // pantalla donde tampoco puede entrar — el login también necesita core. Un
  // corte de red se pinta y se reintenta; no se convierte en un logout.
  useEffect(() => {
    if (estado === "fuera") alPerder?.();
  }, [estado, alPerder]);

  const valor = useMemo<Sesion>(
    () => ({
      ...datos,
      estado,
      tiene: (...pedidos: Rol[]) => tieneRol(datos, pedidos),
      alcanza: (codigoSede: string) => alcanzaSede(datos, codigoSede),
      recargar: cargar,
      salir,
    }),
    [datos, estado, cargar, salir],
  );

  return createElement(Contexto.Provider, { value: valor }, children);
}

export function useSesion(): Sesion {
  return useContext(Contexto);
}

export type { Actor, DatosSesion, ModoAuth, Organizacion, Rol };
