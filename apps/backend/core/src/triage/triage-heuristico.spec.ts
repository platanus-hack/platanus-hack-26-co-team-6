/**
 * El extractor heuristico, bajo prueba.
 *
 * Importa porque es la rama que corre HOY: sin ANTHROPIC_API_KEY, todo el
 * demo pasa por aqui. Y porque es la unica pieza del pipeline clinico que se
 * puede probar sin red, sin llave y sin gastar un peso.
 *
 * Los tres primeros tests son EL GUION DEL PITCH (apps/frontend/lib/demo.ts).
 * Si uno se pone rojo, el demo miente en vivo. No los relajes para que pasen.
 */

import { extraccionHeuristica } from './triage-heuristico';
import { SERVICIOS_SELECCIONABLES } from '../catalogo/servicios-reps';

// Copiados de apps/frontend/lib/demo.ts. Son dos proyectos pnpm separados y
// no comparten paquete todavia; si cambias alla, cambia aca.
const IAM =
  'Paciente masculino de 54 años, dolor precordial opresivo de 40 minutos de evolución, ' +
  'irradiado a mandíbula, diaforético. Electro con supradesnivel del ST en DII, DIII y aVF. ' +
  'Tensión 85 sobre 50, hemodinámicamente inestable. Vamos en móvil medicalizado.';

const ACV =
  'Femenina de 68 años, inicio súbito hace 50 minutos de hemiparesia derecha y afasia de expresión. ' +
  'Glasgow 13. Glicemia 110. Antecedente de fibrilación auricular. Presión 170 sobre 95.';

const POLITRAUMA_PEDIATRICO =
  'Menor de 9 años, atropellamiento en vía pública. Trauma craneoencefálico con Glasgow 9, ' +
  'deformidad en fémur izquierdo, abdomen distendido y doloroso. Taquicárdico en 140, ' +
  'palidez marcada. Requiere manejo de vía aérea.';

describe('extraccionHeuristica', () => {
  describe('el guion del pitch', () => {
    it('IAM con supra ST → triage 2, hemodinamia (743) y UCI adultos (110)', () => {
      const e = extraccionHeuristica(IAM);

      expect(e.triage).toBe(2);
      expect(e.serviciosRequeridos).toContain(743);
      expect(e.serviciosRequeridos).toContain(110);
      expect(e.complejidadRequerida).toBe('alta');
      expect(e.edad).toBe(54);
      expect(e.sexo).toBe('M');
      expect(e.requiereMedicoABordo).toBe(true);
    });

    it('ACV → neurocirugia (245), UCI (110) e imagenes (744)', () => {
      const e = extraccionHeuristica(ACV);

      expect(e.triage).toBe(2);
      expect(e.serviciosRequeridos).toEqual(
        expect.arrayContaining([245, 110, 744]),
      );
      expect(e.edad).toBe(68);
      expect(e.sexo).toBe('F');
    });

    it('politrauma pediatrico → triage 1, cirugia (203) y UCI PEDIATRICA (109)', () => {
      const e = extraccionHeuristica(POLITRAUMA_PEDIATRICO);

      expect(e.triage).toBe(1);
      expect(e.serviciosRequeridos).toContain(203);
      // 109, no 110: mandar un menor a una sede con UCI de adultos y sin UCI
      // pediatrica lo deja sin cama. El filtro de servicios es duro.
      expect(e.serviciosRequeridos).toContain(109);
      expect(e.serviciosRequeridos).not.toContain(110);
      expect(e.requiereMedicoABordo).toBe(true);
    });
  });

  describe('los huecos que la demanda real destapo', () => {
    // Cada uno de estos venia devolviendo "Cuadro clinico no clasificado".
    // El numero es cuantos incidentes al mes hay de ese tipo en Bogota.
    it.each([
      [
        'dolor toracico (355/mes)',
        'Hombre de 60 anos, dolor toracico opresivo.',
        743,
      ],
      [
        'evento respiratorio (1009/mes)',
        'Mujer de 80 anos, dificultad respiratoria, saturacion baja.',
        110,
      ],
      [
        'inconsciente / paro (735/mes)',
        'Paciente con perdida de consciencia, sin respuesta a estimulos.',
        110,
      ],
      [
        'obstetrico',
        'Mujer de 28 anos, cuadro obstetrico con actividad uterina.',
        320,
      ],
      ['quemadura', 'Hombre de 33 anos, quemaduras.', 203],
    ])('%s se clasifica y pide %i', (_caso, texto, servicio) => {
      const e = extraccionHeuristica(texto);

      expect(e.dxDescripcion).not.toBe('Cuadro clínico no clasificado');
      expect(e.serviciosRequeridos).toContain(servicio);
    });

    it('salud mental no exige alta complejidad NI cama de UCI', () => {
      const e = extraccionHeuristica(
        'Paciente con agitacion psicomotora, trastorno mental descompensado.',
      );

      expect(e.dxDescripcion).toBe('Urgencia en salud mental');
      // Exigir alta complejidad aqui descartaba 59 de las 84 sedes sin una
      // sola razon clinica.
      expect(e.complejidadRequerida).toBe('baja');
      // Y exigir UCI adultos recortaba las candidatas de 82 a 47. Una crisis
      // de ansiedad no necesita cuidado intensivo.
      expect(e.serviciosRequeridos).not.toContain(110);
      expect(e.serviciosRequeridos).toHaveLength(0);
    });

    it('un cuadro sin clasificar no exige nada mas que urgencias', () => {
      // serviciosFaltantes() ya agrega 1102 por su cuenta, asi que una lista
      // vacia significa "cualquier sede con urgencias", no "sin filtro".
      const e = extraccionHeuristica('Acompanamiento a evento masivo.');

      expect(e.serviciosRequeridos).toHaveLength(0);
      expect(e.complejidadRequerida).not.toBe('alta');
    });

    it('intento de suicidio gana a salud mental general', () => {
      const e = extraccionHeuristica('Hombre de 22 anos, intento de suicidio.');

      expect(e.dxDescripcion).toBe('Lesión autoinfligida');
      expect(e.triage).toBe(2);
    });
  });

  describe('invariantes', () => {
    it('nunca devuelve un codigo fuera de SERVICIOS_SELECCIONABLES', () => {
      const textos = [
        IAM,
        ACV,
        POLITRAUMA_PEDIATRICO,
        'Paciente con hemorragia activa.',
        'Menor de 6 anos con dificultad respiratoria.',
        'Paciente con intoxicacion aguda y agitacion.',
        'Paciente con dolor abdominal y vomito.',
        'texto que no dice absolutamente nada clinico',
      ];

      for (const texto of textos) {
        for (const codigo of extraccionHeuristica(texto).serviciosRequeridos) {
          expect(SERVICIOS_SELECCIONABLES).toContain(codigo);
        }
      }
    });

    it('un cuadro mixto acumula los servicios de todas sus categorias', () => {
      // TEC = trauma + neuro. Necesita cirugia general Y neurocirugia: si el
      // extractor se quedara con una sola categoria, perderia una de las dos.
      const e = extraccionHeuristica(
        'Hombre de 40 anos con trauma craneoencefalico, Glasgow 8.',
      );

      expect(e.serviciosRequeridos).toEqual(expect.arrayContaining([203, 245]));
      expect(e.signosAlarma.some((s) => s.startsWith('Cuadro mixto'))).toBe(
        true,
      );
    });

    it('un dictado vacio de contenido no inventa un CIE-10', () => {
      const e = extraccionHeuristica('paciente con dolor');

      expect(e.dxCie10).toBeNull();
      expect(e.confianza).toBeLessThan(0.5);
    });

    it('la inestabilidad sube el triage y exige alta complejidad', () => {
      const estable = extraccionHeuristica('Paciente con dolor abdominal.');
      const inestable = extraccionHeuristica(
        'Paciente con dolor abdominal, en shock, hipotenso.',
      );

      expect(estable.triage).toBe(3);
      expect(inestable.triage).toBe(2);
      expect(inestable.complejidadRequerida).toBe('alta');
      expect(inestable.requiereMedicoABordo).toBe(true);
    });

    /**
     * Las siglas clinicas de tres letras son subcadenas de palabras comunes.
     * Sin \b, cada una de estas frases —todas plausibles en un dictado real—
     * disparaba una categoria equivocada, y una categoria equivocada aqui es
     * una ambulancia mandada al servicio equivocado.
     */
    it.each([
      [
        '"mascara de oxigeno" NO es un sindrome coronario',
        'Paciente con mascara de oxigeno al 50%.',
        'Síndrome coronario agudo',
      ],
      [
        '"descartar fractura" NO es un sindrome coronario',
        'Se traslada para descartar lesion.',
        'Síndrome coronario agudo',
      ],
      [
        '"diametro pupilar" NO es un infarto',
        'Paciente con diametro pupilar simetrico.',
        'Síndrome coronario agudo',
      ],
    ])('%s', (_caso, texto, dxProhibido) => {
      expect(extraccionHeuristica(texto).dxDescripcion).not.toBe(dxProhibido);
    });

    it('"femenina" NO convierte a la paciente en pediatrica', () => {
      // "feme-NIN-a" contiene "nin". Con la regex sin \b, esta mujer de 68
      // anos pedia UCI PEDIATRICA y el filtro duro la mandaba a una sede que
      // no puede recibirla.
      const e = extraccionHeuristica(ACV);

      expect(e.serviciosRequeridos).toContain(110);
      expect(e.serviciosRequeridos).not.toContain(109);
      expect(e.edad).toBe(68);
    });

    it('confianza siempre 0.35 — es la senal de que NO salio del LLM', () => {
      expect(extraccionHeuristica(IAM).confianza).toBe(0.35);
      expect(extraccionHeuristica('cualquier cosa').confianza).toBe(0.35);
    });

    it('no duplica servicios aunque coincidan varias categorias', () => {
      const e = extraccionHeuristica(
        'Paciente con trauma, hemorragia activa y quemaduras.',
      );

      expect(new Set(e.serviciosRequeridos).size).toBe(
        e.serviciosRequeridos.length,
      );
    });
  });
});
