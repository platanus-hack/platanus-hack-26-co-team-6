/**
 * Isotipo de PULSO: una línea de ECG que desemboca en un pin de mapa con
 * espiral interior — redibujado a mano como SVG vectorial desde logo.png.
 *
 * Hereda el color vía `currentColor`: se pinta con clases de texto
 * (ej. `text-critico`) y escala con `h-*` + `w-auto`. Sirve tanto en
 * componentes de servidor como de cliente.
 */
export function LogoPulso({
  className,
  decorativo = false,
}: {
  className?: string;
  /** true cuando va junto al wordmark "pulso" y el texto ya nombra la marca. */
  decorativo?: boolean;
}) {
  return (
    <svg
      viewBox="0 72 552 288"
      fill="none"
      stroke="currentColor"
      strokeWidth={24}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={decorativo ? undefined : "img"}
      aria-label={decorativo ? undefined : "PULSO"}
      aria-hidden={decorativo || undefined}
      className={className}
    >
      {/* Pulso: línea base tangente a la espiral, entra al pin sin quiebres */}
      <path d="M24 230H118L134 204L150 230H178L202 116L226 296L248 194L262 242L274 230H430A40 40 0 1 0 395.4 170" />
      {/* Pin: arco mayor + laterales tangentes hacia la punta */}
      <path d="M358.5 247.9A92 92 0 1 1 501.5 247.9L430 336Z" />
    </svg>
  );
}
