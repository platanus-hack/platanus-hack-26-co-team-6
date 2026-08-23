/**
 * Autoverificación de operadores de transporte asistencial — tarea 2.9.
 *
 * Es la tarea 2.1 otra vez, pero contra el otro universo: los 225 prestadores
 * de transporte especial de pacientes que publica la Secretaría de Salud
 * (112 con marca TAB, 53 con TAM, corte 01/07/2026). El archivo ya estaba en
 * `data/procesado/ambulancias.json` desde el pipeline de datos y **nadie lo
 * consumía**; aquí se vuelve el registro contra el que se afilia una empresa
 * de ambulancias sin llenar un formulario.
 *
 * ── EL CRUCE ──────────────────────────────────────────────────────
 * Por NIT si el catálogo lo tiene, porque el NIT es la identidad legal y no
 * se escribe de dos formas. Hoy no lo tiene en ninguna de las 225 filas: la
 * fuente publica razón social, sede, dirección, teléfono y correo, y punto.
 * Así que en la práctica todos los cruces caen por nombre, con trigramas.
 * El camino por NIT queda escrito igual — el día que la Secretaría publique
 * la columna, solo cambia `catalogo-ambulancias.generado.ts`.
 *
 * ── LA TRAMPA ─────────────────────────────────────────────────────
 * El CSV de origen viene en `utf-8-sig` y con los nombres en MAYÚSCULAS SIN
 * TILDES, mientras el afiliado escribe "Clínica del Country S.A.S.". Sin
 * normalizar (tildes, mayúsculas, puntuación, `S.A.S` ↔ `SAS`) no cruza NADA.
 * Eso lo resuelve `similitud.ts::normalizar()`, y hay un test que lo fija.
 *
 * ── Y SI NO CRUZA ─────────────────────────────────────────────────
 * `observada` con motivo, **nunca rechazo** (§3.2). El registro es un corte de
 * julio de 2026: un operador habilitado la semana pasada no está ahí y no por
 * eso deja de existir. La respuesta dice exactamente qué mandar para que un
 * humano lo resuelva.
 */

import { AMBULANCIAS_CATALOGO } from './catalogo-ambulancias.generado';
import {
  UMBRAL_COINCIDENCIA,
  UMBRAL_SUGERENCIA,
  masParecido,
  normalizar,
} from './similitud';
import type {
  OperadorAmbulancia,
  PrecargaOperador,
  VerificacionAfiliacion,
} from './tipos';

/** Lo que hay que mandar cuando el cruce automático no alcanza. */
const QUE_MANDAR = [
  'NIT con dígito de verificación',
  'código de habilitación de transporte asistencial',
  'razón social exactamente como aparece en el REPS',
  'certificado de habilitación vigente en PDF',
];

/** Solo dígitos: el NIT se escribe con puntos y guion la mitad de las veces. */
function soloDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '');
}

export function precargarOperador(fila: OperadorAmbulancia): PrecargaOperador {
  const tipos: ('TAB' | 'TAM')[] = [];
  if (fila.tab) tipos.push('TAB');
  if (fila.tam) tipos.push('TAM');

  return {
    prestador: fila.prestador,
    sede: fila.sede,
    direccion: fila.direccion,
    telefono: fila.telefono,
    correo: fila.correo,
    tipos,
    requiereDeclararFlota: tipos.length === 0,
  };
}

/**
 * Cruza una solicitud contra el registro de transporte asistencial.
 *
 * `catalogo` se inyecta para que el test no dependa de las 225 filas reales;
 * por defecto son ellas.
 */
export function verificarOperador(
  entrada: { nit: string; razonSocial?: string },
  catalogo: readonly OperadorAmbulancia[] = AMBULANCIAS_CATALOGO,
): VerificacionAfiliacion {
  const base = {
    fuente: 'catalogo_compilado' as const,
    falta: [] as string[],
  };

  // ── 1. Por NIT, si el catálogo lo trae ──────────────────────────
  const nit = soloDigitos(entrada.nit);
  if (nit) {
    const porNit = catalogo.find(
      (fila) => fila.nit && soloDigitos(fila.nit) === nit,
    );
    if (porNit) {
      return {
        ...base,
        encontrada: true,
        requiereRevision: false,
        coincidencia: 1,
        mensaje:
          `Cruzó por NIT con "${porNit.prestador}" en el registro de ` +
          `transporte especial de pacientes.`,
        precargaOperador: precargarOperador(porNit),
      };
    }
  }

  // ── 2. Por nombre, con trigramas ────────────────────────────────
  const razonSocial = entrada.razonSocial?.trim();
  if (!razonSocial || !normalizar(razonSocial)) {
    return {
      ...base,
      encontrada: false,
      requiereRevision: true,
      motivo: 'sin_razon_social_para_contrastar',
      mensaje:
        'El registro de transporte asistencial no publica el NIT, así que el ' +
        'cruce se hace por razón social y hace falta enviarla.',
      falta: ['razón social del operador'],
    };
  }

  const mejor = masParecido(razonSocial, catalogo, (fila) =>
    // Se prueba contra los dos nombres: en 225 filas hay prestadores cuya
    // sede se llama distinto ("ADMINISTRADORA COUNTRY S.A.S" opera la
    // "CLINICA DEL COUNTRY IPS") y el afiliado puede escribir cualquiera.
    fila.sede && fila.sede !== fila.prestador
      ? [fila.prestador, fila.sede]
      : [fila.prestador],
  );

  if (mejor && mejor.puntaje > UMBRAL_COINCIDENCIA) {
    const precarga = precargarOperador(mejor.candidato);

    if (precarga.requiereDeclararFlota) {
      // 101 de las 225 filas son IPS que aparecen en el registro solo por su
      // servicio de urgencias, sin marca TAB ni TAM. Cruzaron — la empresa
      // existe y está habilitada — pero no hay flota que precargar, y decirlo
      // ahora evita que el alta de móviles (3.6) se quede sin `movil.tipo`.
      return {
        ...base,
        encontrada: true,
        requiereRevision: true,
        motivo: 'operador_sin_marca_tab_ni_tam',
        coincidencia: mejor.puntaje,
        mensaje:
          `"${mejor.candidato.prestador}" está en el registro, pero sin marca ` +
          `TAB ni TAM: aparece por su servicio de urgencias. La flota hay que ` +
          `declararla móvil por móvil.`,
        falta: ['tipo de cada móvil (TAB o TAM) y su placa'],
        precargaOperador: precarga,
      };
    }

    return {
      ...base,
      encontrada: true,
      requiereRevision: false,
      coincidencia: mejor.puntaje,
      mensaje:
        `Cruzó con "${mejor.candidato.prestador}" en el registro de transporte ` +
        `especial de pacientes. Habilitado para ${precarga.tipos.join(' y ')}.`,
      precargaOperador: precarga,
    };
  }

  // ── 3. No cruza: observada con motivo, nunca rechazo ────────────
  const sugerencia =
    mejor && mejor.puntaje >= UMBRAL_SUGERENCIA
      ? mejor.candidato.prestador
      : undefined;

  return {
    ...base,
    encontrada: false,
    requiereRevision: true,
    motivo: 'operador_fuera_del_registro_de_transporte',
    coincidencia: mejor?.puntaje,
    sugerencia,
    mensaje:
      `No encontramos "${razonSocial}" entre los ${catalogo.length} prestadores ` +
      `de transporte especial de pacientes (corte 01/07/2026)` +
      (sugerencia
        ? `. El más parecido es "${sugerencia}" — si es el mismo, corrige la ` +
          `razón social y vuelve a intentar.`
        : `. La afiliación no queda rechazada: queda observada hasta que un ` +
          `humano la revise.`),
    falta: QUE_MANDAR,
  };
}

/** Cuántos operadores tiene cargados el catálogo. Lo usa el test y el pitch. */
export function totalOperadores(
  catalogo: readonly OperadorAmbulancia[] = AMBULANCIAS_CATALOGO,
): { total: number; tab: number; tam: number } {
  return {
    total: catalogo.length,
    tab: catalogo.filter((f) => f.tab).length,
    tam: catalogo.filter((f) => f.tam).length,
  };
}

/**
 * Reexportado para que el servicio no tenga que importar el archivo generado:
 * el día que el catálogo se lea de Supabase, cambia esta línea y ya.
 */
export { AMBULANCIAS_CATALOGO };
