"use client";

/**
 * /entrar/recuperar — pedir el correo de recuperación.
 *
 * Dos reglas que se cruzan aquí y ninguna cede:
 *
 * 1. **No decir si la cuenta existe.** El servidor responde lo mismo exista o
 *    no, y esta pantalla no mira el cuerpo. Un formulario que dice "ese correo
 *    no está registrado" es un buscador de cuentas válidas, y los correos de un
 *    hospital están en su página web.
 *
 * 2. **No decir que se envió un correo que no se envió.** Hoy core no tiene
 *    `/auth/recuperar` — llega con 1.3. Pintar "revisa tu bandeja" sobre un 404
 *    sería mentirle a alguien que se quedó fuera del sistema de madrugada.
 *
 * Se cumplen las dos a la vez porque el motivo del fallo (404, core caído)
 * es idéntico para todos los correos del mundo: no filtra nada.
 */

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as api from "@/lib/api";
import type { ResultadoRecuperar } from "@/lib/api";
import {
  BotonPrimario,
  Campo,
  Degradado,
  ENLACE_SECUNDARIO,
  PuertaPulso,
} from "@/components/PuertaPulso";

const esquema = z.object({
  correo: z.email("Escribe un correo válido"),
});
type Form = z.infer<typeof esquema>;

export default function Recuperar() {
  const [resultado, setResultado] = useState<ResultadoRecuperar | null>(null);

  const form = useForm<Form>({
    resolver: zodResolver(esquema),
    defaultValues: { correo: "" },
  });

  async function enviar({ correo }: Form) {
    setResultado(await api.recuperar(correo));
  }

  /**
   * El subtítulo dice el estado real, y son tres, no dos.
   *
   * Antes eran dos y estaban al revés: sin haber enviado nada —incluido el
   * primer render, antes de escribir el correo— la pantalla ya decía "te
   * mandamos un enlace". Es exactamente la mentira que este archivo existe
   * para no decir.
   */
  const subtitulo = !resultado
    ? "Escribe tu correo y te mandamos un enlace."
    : resultado.enviado
      ? "Revisa tu correo."
      : "No se envió nada.";

  return (
    <PuertaPulso titulo="Recuperar el acceso" subtitulo={subtitulo}>
      {resultado ? (
        <div className="flex flex-col gap-4">
          {resultado.enviado && (
            <>
              <p role="status" className="text-sm leading-relaxed">
                Si ese correo tiene una cuenta en PULSO, le llega un enlace para
                cambiar la contraseña. Vence en una hora.
              </p>
              <p className="text-xs leading-relaxed text-texto-tenue">
                No confirmamos si la cuenta existe: es la misma respuesta en los
                dos casos, a propósito.
              </p>
            </>
          )}

          {!resultado.enviado && resultado.motivo === "no-construido" && (
            <Degradado>
              <strong className="font-semibold">
                No se envió ningún correo.
              </strong>{" "}
              La recuperación de contraseña todavía no existe en el servidor
              (llega con el modelo de identidad, tarea 1.3). Mientras tanto se
              entra con la contraseña de turno, y quien la tiene puede
              reponértela.
            </Degradado>
          )}

          {!resultado.enviado && resultado.motivo === "sin-core" && (
            <Degradado>
              <strong className="font-semibold">
                No se envió ningún correo.
              </strong>{" "}
              El servidor no respondió. Vuelve a intentarlo; si sigue igual, core
              está caído y no es cosa tuya.
            </Degradado>
          )}

          <div className="flex flex-col gap-2">
            {!resultado.enviado && (
              <BotonPrimario type="button" onClick={() => setResultado(null)}>
                Intentar otra vez
              </BotonPrimario>
            )}
            <Link
              href="/entrar"
              className="grid min-h-14 w-full place-items-center rounded-xl border border-borde text-sm transition-colors hover:border-info"
            >
              Volver a entrar
            </Link>
          </div>
        </div>
      ) : (
        <form
          onSubmit={form.handleSubmit(enviar)}
          noValidate
          className="flex flex-col gap-4"
        >
          <Campo
            id="correo"
            etiqueta="Correo"
            type="email"
            autoFocus
            autoComplete="username"
            placeholder="nombre@tuhospital.co"
            error={form.formState.errors.correo?.message}
            {...form.register("correo")}
          />
          <BotonPrimario type="submit" cargando={form.formState.isSubmitting}>
            Enviar enlace
          </BotonPrimario>
          <div className="flex justify-start">
            <Link
              href="/entrar"
              className={`${ENLACE_SECUNDARIO} text-texto-tenue hover:text-texto`}
            >
              Volver
            </Link>
          </div>
        </form>
      )}
    </PuertaPulso>
  );
}
