/**
 * La hoja de estilo de impresión del expediente.
 *
 * ── POR QUÉ ASÍ Y NO UNA LIBRERÍA DE PDF ──────────────────────────
 * `window.print()` más `@media print` no añade una sola dependencia, imprime
 * lo que el navegador ya sabe paginar y funciona igual en el portátil del
 * regulador y en el del auditor. Una librería de PDF pesaría más que toda
 * esta vista y produciría un documento que hay que volver a maquetar.
 *
 * ── LA REGLA: LEGIBLE EN BLANCO Y NEGRO ───────────────────────────
 * El expediente se imprime para llevarlo a una reunión, a una interventoría o
 * a un juzgado, y eso significa una impresora láser en blanco y negro. **Nada
 * puede distinguirse solo por color**: cada estado lleva además su marca de
 * texto ([CORRECCIÓN], [CORREGIDO], [SERVICIO], [REDACTADO]) y cada bloque su
 * borde. Todo se fuerza a negro sobre blanco porque el tema de pantalla es
 * oscuro y, impreso tal cual, o sale una plancha de tóner o sale ilegible.
 *
 * Se inyecta con una etiqueta <style> en la propia vista y no en
 * `globals.css` porque solo aplica a esta pantalla — y porque `globals.css`
 * es de todo el mundo.
 */

export const CSS_IMPRESION = `
@media print {
  @page { margin: 14mm; }

  /* Negro sobre blanco, pase lo que pase con el tema de pantalla. */
  html, body {
    background: #fff !important;
    color: #000 !important;
  }
  .expediente, .expediente * {
    background: transparent !important;
    color: #000 !important;
    border-color: #000 !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }

  /* Botones, enlaces de navegación y avisos de pantalla: no son el documento. */
  .no-imprimir { display: none !important; }

  /* Que no se corte una fila de la línea de tiempo entre dos páginas. */
  .fila-evento, .bloque { break-inside: avoid; page-break-inside: avoid; }

  .expediente { font-size: 10.5pt; line-height: 1.35; }
  .expediente h1 { font-size: 15pt; }
  .expediente h2 { font-size: 12pt; margin-top: 10pt; }

  /* Las marcas de texto son las que sustituyen al color. */
  .marca {
    border: 1px solid #000 !important;
    padding: 0 3px;
    font-weight: 700;
  }
  .fila-corregida { border-left: 3px solid #000 !important; padding-left: 6px; }

  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #000 !important; padding: 2px 4px; text-align: left; }

  /* El pie de cada página del documento impreso. */
  .pie-impresion { display: block !important; }
}

/* En pantalla el pie de impresión sobra: ahí está la barra de acciones. */
.pie-impresion { display: none; }
`;
