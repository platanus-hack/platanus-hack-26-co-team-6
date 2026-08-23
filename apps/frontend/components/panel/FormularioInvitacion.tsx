"use client";

/**
 * Invitar a alguien a la organización.
 *
 * ── EL SELECTOR DE ROL NO LO DECIDE ESTA PANTALLA ──────────────────
 * Las opciones salen de `rolesOtorgables`, que viene del servidor calculado
 * contra los roles de quien está mirando (invariante 3 de multitenancy §5.3:
 * nadie otorga un rol que no tiene). Filtrar aquí es **cortesía** —evita
 * ofrecer un botón que va a devolver 403—, nunca la seguridad: core responde
 * 403 aunque alguien edite el `<select>` desde las herramientas del navegador.
 *
 * ── SIN PROVEEDOR DE CORREO, EL ENLACE SE ENSEÑA ───────────────────
 * Es la regla 2 del repo, y la parte que suele hacerse mal: lo fácil sería
 * pintar "invitación enviada" siempre. Eso deja a alguien esperando un correo
 * que nunca salió y a quien invitó creyendo que ya está. Si no salió, se dice
 * que no salió y se entrega el enlace para pasarlo por donde sea.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Rol } from "@/lib/sesion-modelo";
import type { ResultadoInvitacion } from "@/lib/api-equipo";
import { mensajeDeError } from "@/lib/api-equipo";
import {
  Alerta,
  Aviso,
  Boton,
  Degradado,
  nombreRol,
  Tarjeta,
  relativo,
} from "./piezas";

const esquema = z.object({
  correo: z.email("Escribe un correo válido"),
  rol: z.string().min(1, "Elige un rol"),
  codigoSede: z.string().optional(),
});
type Formulario = z.infer<typeof esquema>;

export function FormularioInvitacion({
  rolesOtorgables,
  invitar,
}: {
  rolesOtorgables: Rol[];
  invitar: (datos: {
    correo: string;
    rol: Rol;
    codigoSede?: string;
  }) => Promise<ResultadoInvitacion>;
}) {
  const [resultado, setResultado] = useState<ResultadoInvitacion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Formulario>({
    resolver: zodResolver(esquema),
    defaultValues: { correo: "", rol: rolesOtorgables[0] ?? "", codigoSede: "" },
  });

  async function enviar(datos: Formulario) {
    setError(null);
    try {
      const res = await invitar({
        correo: datos.correo,
        rol: datos.rol as Rol,
        codigoSede: datos.codigoSede?.trim() || undefined,
      });
      setResultado(res);
      form.reset({ correo: "", rol: datos.rol, codigoSede: "" });
    } catch (err) {
      setResultado(null);
      setError(
        mensajeDeError(err, "El servidor no respondió. No se invitó a nadie."),
      );
    }
  }

  return (
    <Tarjeta>
      <form
        onSubmit={form.handleSubmit(enviar)}
        noValidate
        className="flex flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            id="correo-invitado"
            etiqueta="Correo"
            type="email"
            autoComplete="off"
            placeholder="nombre@tuhospital.co"
            error={form.formState.errors.correo?.message}
            {...form.register("correo")}
          />

          <div>
            <label
              htmlFor="rol-invitado"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-texto-tenue"
            >
              Rol
            </label>
            <select
              id="rol-invitado"
              className="h-11 w-full rounded-xl border border-borde bg-fondo/70 px-3 text-base outline-none transition-colors focus:border-info"
              {...form.register("rol")}
            >
              {rolesOtorgables.map((rol) => (
                <option key={rol} value={rol}>
                  {nombreRol(rol)}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs leading-relaxed text-texto-tenue">
              Solo aparecen los roles que tú tienes o administras. Nadie reparte
              un permiso que no posee.
            </p>
          </div>
        </div>

        <Campo
          id="sede-invitado"
          etiqueta="Código de sede (opcional)"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Déjalo vacío para toda la organización"
          error={form.formState.errors.codigoSede?.message}
          {...form.register("codigoSede")}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Boton
            type="submit"
            variante="primario"
            cargando={form.formState.isSubmitting}
          >
            Enviar invitación
          </Boton>
          <span className="text-xs text-texto-tenue">
            El enlace sirve una sola vez y vence en 72 horas.
          </span>
        </div>

        {error && <Alerta>{error}</Alerta>}
        {resultado && <Resultado resultado={resultado} />}
      </form>
    </Tarjeta>
  );
}

/** Qué pasó con la invitación recién creada. Nunca dice más de lo que sabe. */
function Resultado({ resultado }: { resultado: ResultadoInvitacion }) {
  const vence = relativo(resultado.invitacion.expiraEn);

  if (resultado.correo.enviado) {
    return (
      <Aviso>
        Invitación enviada a{" "}
        <strong className="font-semibold">{resultado.invitacion.correo}</strong>
        {vence ? ` — vence ${vence}.` : "."}
      </Aviso>
    );
  }

  const sinProveedor = resultado.correo.motivo === "sin-proveedor";

  return (
    <div className="flex flex-col gap-3">
      <Degradado>
        <strong className="font-semibold">No se envió ningún correo.</strong>{" "}
        {sinProveedor
          ? "PULSO no tiene proveedor de correo configurado en este entorno."
          : "El proveedor de correo rechazó el envío."}{" "}
        La invitación existe igual: pásale este enlace a{" "}
        {resultado.invitacion.correo} por el canal que uses.
      </Degradado>
      {resultado.enlace && <Enlace enlace={resultado.enlace} />}
    </div>
  );
}

/**
 * El enlace, en claro y una sola vez.
 *
 * En el servidor solo queda el hash del token, así que **esto no se puede
 * volver a mostrar**. Recargar la página lo pierde para siempre; lo que se
 * puede hacer entonces es invitar otra vez, que emite un enlace nuevo y mata
 * este. El aviso lo dice antes de que pase, no después.
 */
function Enlace({ enlace }: { enlace: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
    } catch {
      // El portapapeles no existe fuera de un contexto seguro (http:// que no
      // sea localhost). No es un fallo que valga un mensaje de error: el
      // enlace está ahí abajo, seleccionable.
      setCopiado(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-borde bg-fondo/60 p-3">
      {/* `break-all` y no `overflow-x`: un token de 43 caracteres dentro de una
          URL desborda 320 px sin remedio, y la página no puede scrollear en
          horizontal. Que corte por donde sea; se copia con el botón. */}
      <code className="block break-all font-mono text-xs leading-relaxed text-texto-tenue">
        {enlace}
      </code>
      <div className="flex flex-wrap items-center gap-3">
        <Boton type="button" onClick={copiar}>
          {copiado ? "Copiado" : "Copiar enlace"}
        </Boton>
        <span className="text-xs text-texto-tenue">
          Guárdalo ahora: no se puede volver a ver.
        </span>
      </div>
    </div>
  );
}

/** Campo de texto. 44 px, igual que el resto del panel. */
function Campo({
  id,
  etiqueta,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  etiqueta: string;
  error?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-texto-tenue"
      >
        {etiqueta}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`h-11 w-full rounded-xl border bg-fondo/70 px-3 text-base outline-none transition-colors placeholder:text-texto-tenue/50 focus:border-info ${
          error ? "border-alerta" : "border-borde"
        }`}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-alerta">
          {error}
        </p>
      )}
    </div>
  );
}
