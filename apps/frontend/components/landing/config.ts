/**
 * Config compartida de la landing: easings firma del lenguaje Pulsewave
 * y el registro de imágenes. Cuando Juan tenga una imagen real, la pone
 * en `public/landing/` y cambia `src: null` por la ruta — nada más.
 * Un slot también puede ser un clip corto: `video` tiene prioridad sobre
 * `src` y se reproduce en loop, mudo.
 */

type Bezier = [number, number, number, number];

export const EASE_FIRMA: Bezier = [0.22, 1, 0.36, 1];
export const EASE_SUAVE: Bezier = [0.25, 1, 0.5, 1];
export const EASE_EXPO: Bezier = [0.16, 1, 0.3, 1];
export const EASE_REBOTE: Bezier = [0.34, 1.56, 0.64, 1];

export interface RegistroImagen {
  src: string | null;
  /** Clip mp4 en loop; si está, gana sobre `src`. */
  video?: string | null;
  alt: string;
  nota: string;
}

export const IMAGENES: Record<string, RegistroImagen> = {
  dictado: {
    src: null,
    video: "/landing/dictado.mp4",
    alt: "Paramédico dictando el caso dentro de la ambulancia en movimiento",
    nota: "Clip del paramédico dictando en la ambulancia (public/landing/dictado.mp4)",
  },
  triage: {
    src: null,
    alt: "Caso estructurado por la IA",
    nota: "Screenshot de la tarjeta del caso: CIE-10, triage y servicios requeridos",
  },
  ranking: {
    src: null,
    alt: "Ranking de sedes con la #1 dominante",
    nota: "Screenshot de /campo: tarjeta #1 héroe y la más cercana descartada por servicios",
  },
  handshake: {
    src: null,
    alt: "Hospital aceptando el caso",
    nota: "Screenshot de /hospital: la tarjeta entrante con los dos botones",
  },
  panoramica: {
    src: null,
    video: "/landing/panoramica.mp4",
    alt: "Ambulancia recorriendo la ciudad de noche",
    nota: "Clip de la ambulancia en la calle (public/landing/panoramica.mp4)",
  },
  mapa: {
    src: null,
    alt: "Mapa con la ruta a la sede elegida",
    nota: "Screenshot del mapa Mapbox dark con la ruta rosa→naranja al destino",
  },
  equipo: {
    src: "/landing/equipo.jpg",
    alt: "El equipo PULSO en el Platanus Hack",
    nota: "Selfie del equipo en el hack (public/landing/equipo.jpg)",
  },
};
