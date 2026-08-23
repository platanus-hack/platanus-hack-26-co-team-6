"use client";

/**
 * Rejilla de puntos con un pulso que se expande desde el centro.
 *
 * Es el fondo de las pantallas de acceso. La idea no es decorar: es que la
 * primera pantalla del sistema **se llame como el sistema**. Un anillo sale del
 * centro cada pocos segundos y enciende los puntos a su paso — un latido —, y
 * el cursor arrastra un halo tenue.
 *
 * ── POR QUÉ OGL Y NO THREE.JS ──────────────────────────────────────
 * Las dependencias de esta app están cerradas a `motion`, `lucide-react`, `ogl`
 * y `mapbox-gl` (ver AGENTS.md). OGL pesa ~10 kB contra los ~600 kB de three,
 * y la landing ya tiene un shader suyo en `landing/WebThreads.tsx`: este
 * archivo copia su ciclo de vida a propósito, no inventa otro.
 *
 * ── LO QUE HACE PARA NO ESTORBAR ───────────────────────────────────
 * - `prefers-reduced-motion`: pinta UN fotograma y se calla. Sigue habiendo
 *   textura, no hay movimiento. No es un apagado: es la misma imagen quieta.
 * - Fuera de pantalla o pestaña oculta: deja de pintar. Esto puede acabar en el
 *   teléfono de alguien que trabaja doce horas.
 * - Sin WebGL: no monta nada y la pantalla se queda con su degradado CSS. El
 *   login tiene que funcionar en el navegador que sea.
 */

import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Triangle } from "ogl";

const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision mediump float;

uniform vec2  iResolution;
uniform float iTime;
uniform vec2  uMouse;         // en píxeles de dispositivo
uniform float uMouseActivo;   // 0..1, entra y sale suave
uniform float uPaso;          // separación entre puntos
uniform float uPunto;         // diámetro del punto
uniform vec3  uColorBase;
uniform vec3  uColorAcento;

out vec4 fragColor;

const float PHI = 1.61803398874989484820459;

float aleatorio(vec2 celda) {
  return fract(tan(distance(celda * PHI, celda) * 0.5) * celda.x);
}

void main() {
  vec2 st = gl_FragCoord.xy;

  // Centrar la rejilla: sin esto queda una fila a medias contra el borde.
  vec2 sobra = mod(iResolution, uPaso) * 0.5;
  st -= sobra;

  vec2 celda = floor(st / uPaso);
  vec2 dentro = fract(st / uPaso);

  // El punto. Un cuadrado con las esquinas comidas se lee como círculo a este
  // tamaño y cuesta la mitad que un smoothstep radial.
  float radio = uPunto / uPaso;
  float mascara =
      (1.0 - step(radio, dentro.x)) * (1.0 - step(radio, dentro.y));
  if (mascara < 0.5) {
    fragColor = vec4(0.0);
    return;
  }

  // Base: parpadeo lento y despareja, para que la rejilla no se lea como una
  // textura repetida.
  float semilla = aleatorio(celda);
  float base = 0.16 + 0.22 * aleatorio(celda * floor(iTime * 0.2 + semilla * 4.0));

  // El latido: un anillo que sale del centro. fract() lo repite; la gaussiana
  // le da grosor y bordes suaves.
  vec2 centro = iResolution * 0.5 / uPaso;
  float dist = distance(centro, celda + 0.5);
  float alcance = length(iResolution * 0.5 / uPaso);
  float frente = fract(iTime * 0.13) * alcance * 1.4;
  // El denominador es el grosor del anillo: con 18 pasaba tan rapido que se
  // leia como ruido. Con 45 se ve pasar una onda.
  float anillo = exp(-pow(dist - frente, 2.0) / 45.0);
  // Se apaga al final del recorrido en vez de cortarse de golpe al reiniciar.
  anillo *= 1.0 - smoothstep(0.75, 1.0, frente / (alcance * 1.4));

  // El cursor. Radio generoso: es un halo, no un puntero.
  float haloDist = distance(uMouse / uPaso, celda + 0.5);
  float halo = exp(-pow(haloDist, 2.0) / 110.0) * uMouseActivo;

  float energia = clamp(anillo + halo, 0.0, 1.0);
  float opacidad = clamp(base + energia * 1.15, 0.0, 1.0);

  // El acento solo aparece donde hay energía. Un fondo rojo entero competiría
  // con el semáforo clínico, que es donde el rojo significa algo.
  vec3 color = mix(uColorBase, uColorAcento, energia * 0.85);

  fragColor = vec4(color * opacidad, opacidad);
}
`;

/** #0a0e14 → [0.04, 0.05, 0.08]. Los tokens viven en globals.css. */
function rgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return [1, 1, 1];
  return [
    parseInt(m[1], 16) / 255,
    parseInt(m[2], 16) / 255,
    parseInt(m[3], 16) / 255,
  ];
}

export function RejillaPulso({
  /** Tenue a propósito: detrás va un formulario que hay que poder leer. */
  colorBase = "#4d6382",
  /** El rojo de marca, solo en la cresta del pulso. */
  colorAcento = "#ff3b47",
  className = "",
}: {
  colorBase?: string;
  colorAcento?: string;
  className?: string;
}) {
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;

    // Sin WebGL2 (o con la GPU bloqueada) el constructor revienta. No es un
    // error que reportar: es una pantalla de login que se pinta sin fondo.
    let renderer: Renderer;
    try {
      renderer = new Renderer({
        webgl: 2,
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      });
    } catch {
      return;
    }

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    contenedor.appendChild(canvas);
    // Avisa al suelo CSS de que ya no hace falta. Ver PuertaPulso.
    contenedor.dataset.webgl = "si";

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Float32Array([1, 1]) },
        uMouse: { value: new Float32Array([-9999, -9999]) },
        uMouseActivo: { value: 0 },
        uPaso: { value: 22 },
        uPunto: { value: 3.0 },
        uColorBase: { value: new Float32Array(rgb(colorBase)) },
        uColorAcento: { value: new Float32Array(rgb(colorAcento)) },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const medir = () => {
      const { clientWidth: w, clientHeight: h } = contenedor;
      renderer.setSize(w, h);
      const res = program.uniforms.iResolution.value as Float32Array;
      res[0] = gl.canvas.width;
      res[1] = gl.canvas.height;
      // El paso crece con la densidad de pantalla: en un móvil retina la
      // rejilla se vería el doble de apretada que en el proyector del demo.
      program.uniforms.uPaso.value = 22 * renderer.dpr;
      program.uniforms.uPunto.value = 3.0 * renderer.dpr;
    };
    const ro = new ResizeObserver(medir);
    ro.observe(contenedor);
    medir();

    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (quieto) {
      // Un fotograma con el anillo a media expansión: queda la textura y la
      // insinuación del pulso, sin nada que se mueva.
      program.uniforms.iTime.value = 2.4;
      renderer.render({ scene: mesh });
      return () => {
        ro.disconnect();
        delete contenedor.dataset.webgl;
        contenedor.removeChild(canvas);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      };
    }

    const objetivo = new Float32Array([-9999, -9999]);
    let activoObjetivo = 0;

    const alMover = (e: PointerEvent) => {
      const caja = contenedor.getBoundingClientRect();
      objetivo[0] = (e.clientX - caja.left) * renderer.dpr;
      // gl_FragCoord tiene el origen abajo; el ratón, arriba.
      objetivo[1] = (caja.height - (e.clientY - caja.top)) * renderer.dpr;
      activoObjetivo = 1;
    };
    const alSalir = () => {
      activoObjetivo = 0;
    };
    window.addEventListener("pointermove", alMover, { passive: true });
    window.addEventListener("pointerleave", alSalir);

    let raf = 0;
    let visible = true;
    let pestanaVisible = !document.hidden;
    const t0 = performance.now();

    const bucle = (t: number) => {
      program.uniforms.iTime.value = (t - t0) * 0.001;

      // Interpolación al 8%: el halo persigue al cursor con inercia en vez de
      // pegarse a él. Pegado se lee como un puntero; con retraso, como luz.
      const raton = program.uniforms.uMouse.value as Float32Array;
      raton[0] += 0.08 * (objetivo[0] - raton[0]);
      raton[1] += 0.08 * (objetivo[1] - raton[1]);
      program.uniforms.uMouseActivo.value +=
        0.06 * (activoObjetivo - (program.uniforms.uMouseActivo.value as number));

      renderer.render({ scene: mesh });
      raf = requestAnimationFrame(bucle);
    };

    const arrancar = () => {
      if (visible && pestanaVisible && raf === 0) raf = requestAnimationFrame(bucle);
    };
    const parar = () => {
      if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const io = new IntersectionObserver(
      ([entrada]) => {
        visible = entrada.isIntersecting;
        if (visible) arrancar();
        else parar();
      },
      { threshold: 0 },
    );
    io.observe(contenedor);

    const alCambiarPestana = () => {
      pestanaVisible = !document.hidden;
      if (pestanaVisible) arrancar();
      else parar();
    };
    document.addEventListener("visibilitychange", alCambiarPestana);

    arrancar();

    return () => {
      parar();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", alCambiarPestana);
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerleave", alSalir);
      delete contenedor.dataset.webgl;
      try {
        contenedor.removeChild(canvas);
      } catch {}
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [colorBase, colorAcento]);

  return <div ref={contenedorRef} aria-hidden className={className} />;
}

export default RejillaPulso;
