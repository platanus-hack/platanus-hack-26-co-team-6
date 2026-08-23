/**
 * Dominio de la posición: validación del reporte y localidad estimada.
 *
 * Prueban comportamiento, no implementación: qué acepta y qué rechaza el
 * servidor, y qué localidad le pone a un punto. Ninguno levanta Nest.
 */

import type { Sede } from '../contracts/types';
import {
  localidadDe,
  normalizarMovilId,
  validarReporte,
  RADIO_LOCALIDAD_KM,
} from './posicion';

/** Un reporte que debe pasar siempre. Los tests lo estropean campo a campo. */
const BUENO = { lat: 4.65, lng: -74.08, disponible: true };

const sede = (localidad: string, lat: number, lng: number): Sede =>
  ({
    codigo: `${localidad}-${lat}`,
    nombre: localidad,
    direccion: '',
    localidad,
    coord: { lat, lng },
    naturaleza: 'Pública',
    complejidad: 'alta',
    telefono: null,
    servicios: [],
    camas: [],
  }) as Sede;

describe('validarReporte', () => {
  it('acepta un reporte completo y conserva la precisión del GPS', () => {
    const r = validarReporte({ ...BUENO, precisionM: 42.4, velocidadKmh: 38 });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.precisionM).toBe(42);
    expect(r.valor.velocidadKmh).toBe(38);
    expect(r.valor.disponible).toBe(true);
  });

  it('acepta un reporte sin velocidad ni precisión', () => {
    const r = validarReporte(BUENO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.precisionM).toBeNull();
    expect(r.valor.velocidadKmh).toBeNull();
  });

  it('exige disponible: un default sería afirmar algo que nadie dijo', () => {
    const r = validarReporte({ lat: 4.65, lng: -74.08 });
    expect(r.ok).toBe(false);
  });

  it('rechaza lat/lng ausentes o no numéricos', () => {
    expect(validarReporte({ disponible: true }).ok).toBe(false);
    expect(validarReporte({ ...BUENO, lat: 'norte' }).ok).toBe(false);
    expect(validarReporte({ ...BUENO, lng: NaN }).ok).toBe(false);
  });

  it('rechaza una posición fuera de Bogotá — es el síntoma de geo por IP', () => {
    // Times Square. Sin este corte, una VPN pone una ambulancia en Nueva York
    // y el mapa de cobertura lo pinta sin un solo error en pantalla.
    const r = validarReporte({ lat: 40.758, lng: -73.985, disponible: true });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/cobertura/i);
  });

  it('recorta una velocidad absurda en vez de tirar la posición', () => {
    const r = validarReporte({ ...BUENO, velocidadKmh: 9000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.velocidadKmh).toBe(300);
  });

  it('rechaza una velocidad negativa', () => {
    expect(validarReporte({ ...BUENO, velocidadKmh: -5 }).ok).toBe(false);
  });

  it('rechaza una precisión no positiva', () => {
    expect(validarReporte({ ...BUENO, precisionM: 0 }).ok).toBe(false);
  });

  it('un cuerpo vacío no revienta: es un 400 con motivo', () => {
    expect(validarReporte(null).ok).toBe(false);
    expect(validarReporte('AMB-014').ok).toBe(false);
  });
});

describe('localidadDe', () => {
  const sedes = [
    sede('Chapinero', 4.65, -74.06),
    sede('Kennedy', 4.63, -74.15),
  ];

  it('devuelve la localidad de la sede más cercana', () => {
    expect(localidadDe({ lat: 4.651, lng: -74.061 }, sedes)).toBe('Chapinero');
    expect(localidadDe({ lat: 4.631, lng: -74.151 }, sedes)).toBe('Kennedy');
  });

  it('no inventa localidad si no hay ninguna sede cerca', () => {
    // A un grado de latitud (~111 km) de todo: "no sé" es la respuesta honesta.
    expect(localidadDe({ lat: 4.0, lng: -74.9 }, sedes)).toBeNull();
  });

  it('ignora sedes sin localidad en vez de devolver una vacía', () => {
    const anonima = { ...sede('X', 4.65, -74.06), localidad: null } as Sede;
    expect(localidadDe({ lat: 4.65, lng: -74.06 }, [anonima])).toBeNull();
  });

  it('respeta el radio máximo que se le pase', () => {
    const casi = { lat: 4.66, lng: -74.06 }; // ~1.1 km de la sede de Chapinero
    expect(localidadDe(casi, sedes)).toBe('Chapinero');
    expect(localidadDe(casi, sedes, 0.5)).toBeNull();
    expect(RADIO_LOCALIDAD_KM).toBeGreaterThan(0);
  });
});

describe('normalizarMovilId', () => {
  it('deja el mismo móvil escrito de tres formas como una sola fila', () => {
    expect(normalizarMovilId('amb 014')).toBe('AMB-014');
    expect(normalizarMovilId('  AMB-014 ')).toBe('AMB-014');
    expect(normalizarMovilId('Amb-014')).toBe('AMB-014');
  });

  it('un identificador vacío queda vacío para que el llamador lo rechace', () => {
    expect(normalizarMovilId('   ')).toBe('');
  });
});
