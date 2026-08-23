/**
 * `construirBundleRda` — de un caso de PULSO a un borrador de RDA FHIR R4.
 *
 * Función PURA: mismas entradas, mismo Bundle byte por byte (los ids son
 * UUID v5 derivados del `casoId`, no aleatorios). Eso importa por dos razones
 * prácticas: el borrador que un humano firma en 4.10 es el mismo que se le
 * mostró, y un test puede comparar salidas sin congelar el reloj.
 *
 * ═══ EL PARÁMETRO ES `CasoPublico`, NO `Caso` — Y ES A PROPÓSITO ══
 * El RDA no puede llevar el dictado literal (`textoCrudo`) ni el punto de
 * recogida del paciente (`origen`). Pedir `CasoPublico` hace que ni siquiera
 * se puedan leer desde aquí: es el mismo truco de `estado.service.ts::
 * despojar()`, la lista blanca que deja de compilar si alguien agrega un campo
 * sensible. Un `Caso` entra sin conversión porque `CasoPublico` es su Omit.
 *
 * ═══ INVARIANTES QUE ESTE ARCHIVO SOSTIENE ════════════════════════
 * 1. Toda `Reference` emitida resuelve contra el `fullUrl` de una entrada del
 *    mismo Bundle. Si el recurso no existe, la referencia NO se emite.
 * 2. Ningún dato inventado. Lo que falta sale en `huecos[]`.
 * 3. El borrador siempre nace `pendiente`. Nada aquí lo firma ni lo envía.
 */

import { createHash } from 'node:crypto';
import type { CasoPublico, CodServicio, Sede } from '../contracts/types';
import { ETIQUETA_TRIAGE, nombreServicio } from '../catalogo/servicios-reps';
import {
  AVISO_BORRADOR,
  EVENTOS_DE_CIERRE,
  type BorradorRda,
  type CoberturaRda,
  type EventoTrasladoRda,
  type HuecoRda,
} from './borrador';
import {
  CODESYSTEM,
  CODIGO,
  GUIA_RDA,
  NAMINGSYSTEM,
  PERFIL,
  SECCIONES_EXIGIDAS_MIN,
  SECCIONES_VERIFICADAS,
  SISTEMA,
  TITULO_RDA_URGENCIAS,
  TRIAGE_A_CLASE,
} from './perfiles-ihce';
import type {
  Bundle,
  Composition,
  CompositionSection,
  Condition,
  Encounter,
  EntradaBundle,
  Observation,
  Organization,
  RecursoRda,
  Reference,
  ServiceRequest,
} from './tipos-fhir';

/**
 * Namespace UUID de PULSO para derivar ids de recursos RDA. Se eligió una vez
 * y se congela: cambiarlo re-numera todos los borradores ya emitidos.
 */
const NAMESPACE_RDA = 'b0f7a4e2-3c91-4d58-9a16-5e0c7d842f31';

/** El código de habilitación de SEDE del REPS tiene 12 dígitos exactos. */
const CODIGO_SEDE_REPS = /^\d{12}$/;

/**
 * Perfiles que `BundleEmergencyRDA` exige 1..1 (leído de sus slices de
 * `entry`), más el encuentro, que `CompositionEmergencyRDA.encounter` exige
 * 1..1. Es la lista contra la que se mide la cobertura del borrador.
 */
const PERFILES_EXIGIDOS = [
  'CompositionEmergencyRDA',
  'EncounterEmergencyRDA',
  'PatientRDA',
  'CareDeliveryOrganizationRDA',
  'PractitionerRDA',
  'DocumentReferenceEPIRDA',
] as const;

// ─────────────────────────────────────────────────────────────────
// El constructor
// ─────────────────────────────────────────────────────────────────

export function construirBundleRda(
  caso: CasoPublico,
  sede: Sede | null,
  eventos: EventoTrasladoRda[] = [],
  ahora: string = new Date().toISOString(),
): BorradorRda {
  const huecos: HuecoRda[] = [];
  const entradas: EntradaBundle[] = [];
  const presentes: string[] = [];

  /** Mete un recurso al Bundle y devuelve la referencia que YA resuelve. */
  const agregar = (recurso: RecursoRda, perfil: string): Reference => {
    entradas.push({ fullUrl: `urn:uuid:${recurso.id}`, resource: recurso });
    presentes.push(perfil);
    return { reference: `urn:uuid:${recurso.id}` };
  };

  const idDe = (parte: string) => uuidDeterminista(`${caso.id}:${parte}`);

  // ── La IPS receptora ────────────────────────────────────────────
  const refOrganizacion = sede
    ? agregar(
        construirOrganizacion(sede, idDe('Organization'), huecos),
        'CareDeliveryOrganizationRDA',
      )
    : null;
  if (!sede) {
    huecos.push({
      id: 'ips-sin-definir',
      perfil: PERFIL.ips,
      elemento: 'Bundle.entry:CareDeliveryOrganizationResource',
      severidad: 'bloqueante',
      queFalta: 'La IPS que atiende: todavía ninguna sede aceptó el traslado.',
      porQue:
        'El RDA lo genera un prestador identificado. Mientras el handshake no cierre en "aceptado", PULSO no sabe cuál es, y ponerle la sede mejor rankeada sería inventar el prestador que atendió.',
      quienLoAporta:
        'el propio flujo: la sede que acepte el traslado (POST /handshake/respond)',
    });
  }

  // ── El encuentro de urgencias ───────────────────────────────────
  const periodo = calcularPeriodo(caso.creadoEn, eventos);
  const encuentro = construirEncuentro(
    idDe('Encounter'),
    periodo,
    refOrganizacion,
  );
  const refEncuentro = agregar(encuentro, 'EncounterEmergencyRDA');

  if (!periodo.fin) {
    huecos.push({
      id: 'encuentro-sin-cierre',
      perfil: PERFIL.encuentroUrgencias,
      elemento: 'Encounter.status · Encounter.period.end',
      severidad: 'bloqueante',
      queFalta:
        'El cierre del traslado: no hay evento de llegada a puerta ni de entrega del paciente.',
      porQue:
        'El perfil fija status en "finished" y exige period.end. PULSO deja el encuentro en "in-progress" porque es lo que es: de los 22 eventos del sistema hoy se guardan 3. Sellar un "finished" sin el evento que lo respalda sería firmar una hora de entrega inventada.',
      quienLoAporta:
        'tareas 3.1 (evento_caso → RegistroService) y 3.2 (cablear los 22 eventos)',
      contexto: { inicio: periodo.inicio, eventosRecibidos: eventos.length },
    });
  }

  huecos.push({
    id: 'encuentro-type-sin-codigos',
    perfil: PERFIL.encuentroUrgencias,
    elemento:
      'Encounter.type:encounterModality · :encounterServiceGroup · :encounterEnvironment',
    severidad: 'por-verificar',
    queFalta:
      'Los tres códigos de modalidad, grupo de servicios y entorno que el perfil exige 1..1 cada uno.',
    porQue:
      'La guía navegable rinde los CodeSystem que los ligan pero truncó sus tablas de códigos. Adivinar un código de un CodeSystem nacional es peor que dejar el elemento ausente: el validador señala el ausente, el inventado pasa.',
    quienLoAporta: 'tarea 4.9 (validación contra los perfiles del IHCE)',
    contexto: {
      codeSystems: [
        CODESYSTEM.modalidad,
        CODESYSTEM.grupoServicios,
        CODESYSTEM.entornoAtencion,
      ],
    },
  });

  huecos.push({
    id: 'encuentro-causa-externa',
    perfil: PERFIL.encuentroUrgencias,
    elemento: 'Encounter.reasonCode',
    severidad: 'bloqueante',
    queFalta:
      'La causa externa de la atención (RIPS v2): accidente de tránsito, violencia, enfermedad general…',
    porQue:
      'El dictado del paramédico describe el cuadro clínico, no clasifica la causa externa en la taxonomía de RIPS. PULSO no la captura y no se infiere de un resumen.',
    quienLoAporta:
      'la IPS receptora al completar el RDA, o una captura nueva en /campo',
  });

  // ── Diagnóstico ─────────────────────────────────────────────────
  let refCondicion: Reference | null = null;
  if (caso.dxCie10) {
    refCondicion = agregar(
      construirCondicion(caso, idDe('Condition'), refEncuentro),
      'ConditionRDA',
    );
    huecos.push({
      id: 'diagnostico-provisional',
      perfil: PERFIL.condicion,
      elemento: 'Condition.verificationStatus',
      severidad: 'divergente',
      queFalta:
        'El perfil fija "confirmed"; PULSO emite "provisional" y no lo va a cambiar.',
      porQue:
        'Lo que produce la escena es una impresión diagnóstica prehospitalaria, no un diagnóstico confirmado. Confirmar es un acto del médico de la IPS receptora. Marcarlo "confirmed" desde la ambulancia es precisamente la mentira que este módulo existe para no cometer — y es la razón de fondo por la que PULSO PRE-LLENA el RDA en vez de reportarlo.',
      quienLoAporta: 'el médico de la IPS receptora, al firmar',
    });
    huecos.push({
      id: 'diagnostico-uno-solo',
      perfil: PERFIL.encuentroUrgencias,
      elemento: 'Encounter.diagnosis',
      severidad: 'divergente',
      queFalta:
        'El perfil exige entre 2 y 5 diagnósticos; el traslado aporta uno.',
      porQue:
        'En la escena hay una impresión diagnóstica, no un principal más comorbilidades. El segundo diagnóstico aparece en la atención, no antes.',
      quienLoAporta: 'la IPS receptora',
    });
  } else {
    huecos.push({
      id: 'diagnostico-sin-cie10',
      perfil: PERFIL.condicion,
      elemento: 'Bundle.entry:ConditionResources · Encounter.diagnosis',
      severidad: 'bloqueante',
      queFalta:
        'El código CIE-10. Sin él NO se emite ningún Condition: el perfil exige code.coding:ICD10 1..1.',
      porQue:
        'El dictado no alcanzó para inferir el código (`dxCie10: null`). Un Condition con un CIE-10 aproximado es un diagnóstico falso dentro de un documento clínico firmable. Se prefiere el hueco.',
      quienLoAporta:
        'el médico de la IPS receptora, o una segunda pasada del extractor clínico sobre el mismo dictado',
      contexto: {
        dxDescripcion: caso.dxDescripcion || null,
        triage: caso.triage,
      },
    });
  }

  // ── Triage (Res. 5596/2015) ─────────────────────────────────────
  agregar(
    construirTriage(caso, idDe('Observation-triage'), refEncuentro),
    'ObservationTriageRDA',
  );

  // ── Órdenes de servicio ─────────────────────────────────────────
  for (const cod of caso.serviciosRequeridos) {
    agregar(
      construirOrdenServicio(
        cod,
        caso.creadoEn,
        idDe(`ServiceRequest-${cod}`),
        refEncuentro,
      ),
      'ServiceRequestRDA',
    );
  }
  if (caso.serviciosRequeridos.length > 0) {
    huecos.push({
      id: 'servicios-reps-no-cups',
      perfil: PERFIL.ordenServicio,
      elemento: 'ServiceRequest.code · ServiceRequest.category',
      severidad: 'divergente',
      queFalta:
        'El perfil liga ServiceRequest.code al CodeSystem CUPS; PULSO emite códigos REPS de servicio habilitado.',
      porQue:
        'No son la misma cosa y no hay tabla de equivalencia: un servicio habilitado ("Hemodinamia e intervencionismo", 743) dice qué tiene que poder hacer la sede, no qué procedimiento se le hizo al paciente. Traducirlo a un CUPS sería inventar un procedimiento que nadie realizó. Se emite el código REPS, que es cierto, y se declara la diferencia.',
      quienLoAporta:
        'tarea 4.9 — decidir si esto va como ServiceRequest fuera de perfil, como requisito del traslado, o si no va',
      contexto: {
        emitidoCon: CODESYSTEM.serviciosReps,
        elPerfilPide: CODESYSTEM.cups,
        codigos: caso.serviciosRequeridos,
      },
    });
    huecos.push({
      id: 'orden-servicio-finalidad',
      perfil: PERFIL.ordenServicio,
      elemento: 'ServiceRequest.reasonCode',
      severidad: 'bloqueante',
      queFalta:
        'La finalidad de la consulta (RIPS v2), exigida 1..1 por el perfil.',
      porQue:
        'PULSO no captura esa clasificación en la escena y sus códigos no se leyeron de la guía.',
      quienLoAporta: 'la IPS receptora · tarea 4.9 para los códigos',
      contexto: { codeSystem: CODESYSTEM.finalidadConsulta },
    });
  }

  // ── El documento ────────────────────────────────────────────────
  const composicion = construirComposicion(
    idDe('Composition'),
    ahora,
    refEncuentro,
    refOrganizacion,
    refCondicion,
  );
  // El Composition va PRIMERO: es la regla de un Bundle `document`.
  entradas.unshift({
    fullUrl: `urn:uuid:${composicion.id}`,
    resource: composicion,
  });
  presentes.push('CompositionEmergencyRDA');

  huecos.push({
    id: 'composicion-secciones-incompletas',
    perfil: PERFIL.composicionUrgencias,
    elemento: 'Composition.section',
    severidad: 'por-verificar',
    queFalta: `El perfil exige ${SECCIONES_EXIGIDAS_MIN}..13 secciones con slicing cerrado; solo se pudieron leer ${SECCIONES_VERIFICADAS.length} códigos LOINC de la guía navegable.`,
    porQue:
      'La página del perfil trunca la tabla de slices. Un código LOINC adivinado entra a un documento clínico y no se distingue de uno correcto. Consecuencia visible: el triage y las órdenes de servicio quedan en el Bundle pero sin sección que los referencie.',
    quienLoAporta:
      'tarea 4.9 — enumerar los slices restantes contra el StructureDefinition',
    contexto: {
      seccionesEmitidas: SECCIONES_VERIFICADAS.map((s) => s.slice),
    },
  });

  if (!refOrganizacion) {
    huecos.push({
      id: 'composicion-sin-autor',
      perfil: PERFIL.composicionUrgencias,
      elemento: 'Composition.author · Composition.custodian',
      severidad: 'bloqueante',
      queFalta: 'El autor del documento, exigido 1..1.',
      porQue:
        'El autor es la IPS o el profesional, y no hay ninguno de los dos: nadie aceptó todavía y PULSO no tiene identidad de profesional.',
      quienLoAporta: 'la sede que acepte · tarea 1.1 (actor real)',
    });
  }

  // ── Los dos huecos estructurales del producto ───────────────────
  huecos.push(huecoPaciente(caso), huecoProfesional(caso));

  // ── Y los que la guía exige pero PULSO ni roza ──────────────────
  huecos.push({
    id: 'procedimientos-sin-cups',
    perfil: PERFIL.procedimiento,
    elemento: 'Bundle.entry:ProcedureResources',
    severidad: 'bloqueante',
    queFalta:
      'Los procedimientos realizados, codificados en CUPS con su ejecutante y su fecha.',
    porQue:
      'PULSO rutea el traslado; no registra lo que se le hizo al paciente. No hay CUPS en la escena y no se deriva de nada de lo que PULSO captura.',
    quienLoAporta: 'la IPS receptora',
  });
  huecos.push({
    id: 'documento-soporte-ausente',
    perfil: PERFIL.bundleUrgencias,
    elemento: 'Bundle.entry:DocumentReferenceResources',
    severidad: 'bloqueante',
    queFalta:
      'La referencia al documento PDF de soporte, exigida 1..1 por el Bundle.',
    porQue:
      'Ese PDF es el resumen de atención que emite la IPS. PULSO no produce documentos de atención: produce el traslado que la precede.',
    quienLoAporta: 'la IPS receptora',
  });

  // Lo que PULSO SÍ sabe y el Bundle no supo dónde poner. Se declara para
  // que no se pierda en silencio: un hallazgo clínico que desaparece entre
  // dos formatos es exactamente el "paseo de la muerte" en versión digital.
  if (caso.signosAlarma.length > 0 || caso.resumen) {
    huecos.push({
      id: 'hallazgos-sin-perfil',
      perfil: PERFIL.composicionUrgencias,
      elemento: '(ninguno asignado)',
      severidad: 'por-verificar',
      queFalta:
        'Dónde van el resumen clínico y los signos de alarma que justifican el triage.',
      porQue:
        'Existen en el caso y son lo más útil para quien recibe, pero no se identificó el perfil del RDA que los aloja. Se dejan aquí, visibles, en vez de meterlos a la fuerza en un campo de texto de otro recurso.',
      quienLoAporta: 'tarea 4.9',
      contexto: { resumen: caso.resumen, signosAlarma: caso.signosAlarma },
    });
  }

  // ── El Bundle ───────────────────────────────────────────────────
  const bundle: Bundle = {
    resourceType: 'Bundle',
    id: idDe('Bundle'),
    meta: { profile: [PERFIL.bundleUrgencias] },
    identifier: {
      // URN propio: PULSO no tiene ni pretende tener un espacio de nombres en
      // el IHCE. Inventar un system bajo fhir.minsalud.gov.co sería falsificar
      // una identidad nacional.
      system: 'urn:pulso:rda:borrador',
      value: caso.id,
    },
    type: 'document',
    timestamp: ahora,
    entry: entradas,
  };

  return {
    casoId: caso.id,
    // Único estado que este constructor produce. Lo cambia una firma humana
    // (tarea 4.10), nunca este archivo.
    estado: 'pendiente',
    generadoEn: ahora,
    guia: {
      nombre: GUIA_RDA.nombre,
      version: GUIA_RDA.version,
      navegable: GUIA_RDA.navegable,
    },
    aviso: AVISO_BORRADOR,
    bundle,
    huecos: ordenarHuecos(huecos),
    cobertura: calcularCobertura(presentes),
    firma: null,
  };
}

// ─────────────────────────────────────────────────────────────────
// Recursos
// ─────────────────────────────────────────────────────────────────

function construirOrganizacion(
  sede: Sede,
  id: string,
  huecos: HuecoRda[],
): Organization {
  if (!CODIGO_SEDE_REPS.test(sede.codigo)) {
    huecos.push({
      id: 'codigo-reps-mal-formado',
      perfil: PERFIL.ips,
      elemento: 'Organization.identifier:HealthcareProviderIdentifier.value',
      severidad: 'bloqueante',
      queFalta:
        'Un código de habilitación de sede del REPS de 12 dígitos. El de esta sede no lo es.',
      porQue:
        'El catálogo de sedes admite entradas sin código REPS verificado. Emitirlo igual haría que el prestador del documento no exista en el registro nacional.',
      quienLoAporta: 'el ETL del REPS (catálogo de sedes)',
      contexto: { codigoRecibido: sede.codigo },
    });
  }

  huecos.push({
    id: 'ips-sin-nit',
    perfil: PERFIL.ips,
    elemento: 'Organization.identifier:TaxIdentifier',
    severidad: 'bloqueante',
    queFalta:
      'El NIT de la IPS. El perfil exige exactamente 2 identificadores: NIT + código de habilitación.',
    porQue:
      'El catálogo del REPS que carga PULSO trae el código de habilitación, no el NIT. Es un dato de otra fuente.',
    quienLoAporta: 'el ETL del REPS · el registro de la organización (tarea 2.x)',
  });

  huecos.push({
    id: 'ips-clase-prestador',
    perfil: PERFIL.ips,
    elemento: 'Organization.type:ProviderClass',
    severidad: 'por-verificar',
    queFalta: 'La clasificación del prestador, exigida 1..1.',
    porQue:
      'No se leyó de la guía el CodeSystem ni los códigos válidos. PULSO conoce la naturaleza (pública/privada/mixta) y la complejidad, pero no son ese vocabulario.',
    quienLoAporta: 'tarea 4.9',
    contexto: { naturaleza: sede.naturaleza, complejidad: sede.complejidad },
  });

  huecos.push({
    id: 'ips-codigo-prestador-o-sede',
    perfil: PERFIL.ips,
    elemento: 'Organization.identifier:HealthcareProviderIdentifier.type',
    severidad: 'por-verificar',
    queFalta:
      'Si el perfil quiere el código de PRESTADOR (10 dígitos) o el de SEDE (12).',
    porQue:
      'El tipo se llama "CodigoPrestador", pero PULSO identifica destinos por sede (`codigohabilitacionsede`, 12 dígitos) porque dos sedes del mismo prestador no tienen la misma capacidad. Se emiten los 12; los 10 primeros son el prestador.',
    quienLoAporta: 'tarea 4.9',
  });

  return {
    resourceType: 'Organization',
    id,
    meta: { profile: [PERFIL.ips] },
    identifier: [
      {
        use: 'official',
        type: {
          coding: [
            {
              system: CODESYSTEM.identificadoresOrganizacion,
              code: CODIGO.codigoPrestador,
            },
          ],
        },
        system: NAMINGSYSTEM.reps,
        value: sede.codigo,
      },
    ],
    active: true,
    name: sede.nombre,
    address: [
      {
        use: 'work',
        type: 'physical',
        line: [sede.direccion],
        district: sede.localidad ?? undefined,
        city: 'Bogotá, D.C.',
        state: 'Bogotá, D.C.',
        country: 'CO',
      },
    ],
  };
}

function construirEncuentro(
  id: string,
  periodo: { inicio: string; fin: string | null },
  refOrganizacion: Reference | null,
): Encounter {
  return {
    resourceType: 'Encounter',
    id,
    meta: { profile: [PERFIL.encuentroUrgencias] },
    // El perfil fija "finished". Se emite lo que ES: mientras no haya evento
    // de cierre, el encuentro sigue abierto. El hueco lo dice en voz alta.
    status: periodo.fin ? 'finished' : 'in-progress',
    class: { system: SISTEMA.claseActo, code: CODIGO.claseUrgencias },
    // subject: ausente a propósito — no hay PatientRDA. Ver huecoPaciente().
    period: periodo.fin
      ? { start: periodo.inicio, end: periodo.fin }
      : { start: periodo.inicio },
    ...(refOrganizacion ? { serviceProvider: refOrganizacion } : {}),
  };
}

function construirTriage(
  caso: CasoPublico,
  id: string,
  refEncuentro: Reference,
): Observation {
  const clase = TRIAGE_A_CLASE[caso.triage];
  return {
    resourceType: 'Observation',
    id,
    meta: { profile: [PERFIL.triage] },
    status: 'final',
    code: {
      coding: [{ system: SISTEMA.snomed, code: CODIGO.observacionTriage }],
      text: 'Triage',
    },
    encounter: refEncuentro,
    effectiveDateTime: caso.creadoEn,
    valueCodeableConcept: {
      coding: [
        {
          system: CODESYSTEM.claseTriage,
          code: clase.code,
          display: clase.display,
        },
      ],
      // La etiqueta de PULSO trae además el plazo de la Res. 5596/2015, que es
      // lo que un humano necesita leer cuando revisa el borrador.
      text: ETIQUETA_TRIAGE[caso.triage],
    },
  };
}

function construirCondicion(
  caso: CasoPublico,
  id: string,
  refEncuentro: Reference,
): Condition {
  return {
    resourceType: 'Condition',
    id,
    meta: { profile: [PERFIL.condicion] },
    clinicalStatus: {
      coding: [{ system: SISTEMA.estadoClinico, code: 'active' }],
    },
    // "provisional", no "confirmed". Ver el hueco `diagnostico-provisional`.
    verificationStatus: {
      coding: [{ system: SISTEMA.estadoVerificacion, code: 'provisional' }],
    },
    code: {
      coding: [
        {
          system: SISTEMA.icd10,
          code: caso.dxCie10 ?? undefined,
          display: caso.dxDescripcion || undefined,
        },
      ],
      text: caso.dxDescripcion || undefined,
    },
    encounter: refEncuentro,
    recordedDate: caso.creadoEn,
  };
}

function construirOrdenServicio(
  cod: CodServicio,
  authoredOn: string,
  id: string,
  refEncuentro: Reference,
): ServiceRequest {
  return {
    resourceType: 'ServiceRequest',
    id,
    meta: { profile: [PERFIL.ordenServicio] },
    status: 'active',
    intent: 'order',
    // category y reasonCode: ausentes. Ver `orden-servicio-finalidad`.
    code: {
      coding: [
        {
          system: CODESYSTEM.serviciosReps,
          code: String(cod),
          display: nombreServicio(cod),
        },
      ],
    },
    encounter: refEncuentro,
    authoredOn,
  };
}

function construirComposicion(
  id: string,
  ahora: string,
  refEncuentro: Reference,
  refOrganizacion: Reference | null,
  refCondicion: Reference | null,
): Composition {
  const secciones: CompositionSection[] = SECCIONES_VERIFICADAS.map((s) => {
    const entradas =
      s.slice === 'sectionProblems' && refCondicion ? [refCondicion] : [];
    const seccion: CompositionSection = {
      title: s.titulo,
      code: { coding: [{ system: SISTEMA.loinc, code: s.loinc }] },
    };
    if (entradas.length > 0) {
      seccion.entry = entradas;
    } else {
      // cmp-2: una sección sin contenido necesita emptyReason. "nilknown" =
      // no se sabe, que es la verdad: PULSO no lo capturó.
      seccion.emptyReason = {
        coding: [
          { system: SISTEMA.razonSeccionVacia, code: CODIGO.seccionSinDatos },
        ],
      };
    }
    return seccion;
  });

  return {
    resourceType: 'Composition',
    id,
    meta: { profile: [PERFIL.composicionUrgencias] },
    // "preliminary" hasta que un humano firme (tarea 4.10). Es la regla 6 del
    // repo dicha en el vocabulario del estándar.
    status: 'preliminary',
    type: { coding: [{ system: SISTEMA.loinc, code: CODIGO.tipoDocumentoRda }] },
    // subject: ausente — no hay PatientRDA.
    encounter: refEncuentro,
    date: ahora,
    ...(refOrganizacion
      ? { author: [refOrganizacion], custodian: refOrganizacion }
      : {}),
    title: TITULO_RDA_URGENCIAS,
    section: secciones,
  };
}

// ─────────────────────────────────────────────────────────────────
// Los dos huecos estructurales
// ─────────────────────────────────────────────────────────────────

function huecoPaciente(caso: CasoPublico): HuecoRda {
  return {
    id: 'paciente-seudonimo',
    perfil: PERFIL.paciente,
    elemento:
      'Bundle.entry:PatientResource · Composition.subject · Encounter.subject · Observation.subject · Condition.subject · ServiceRequest.subject',
    severidad: 'bloqueante',
    queFalta:
      'El paciente: documento de identidad, nombre, fecha de nacimiento, dirección, nacionalidad, etnia y discapacidad.',
    porQue:
      'PULSO es SEUDÓNIMO POR DISEÑO. En la escena nadie pide la cédula antes de rutear una ambulancia, y el sistema no la necesita para decidir a qué hospital va el paciente. No hay recurso Patient, y por eso ninguna referencia a él se emite: un `subject` colgando sería peor que su ausencia. La identificación ocurre en admisiones.',
    quienLoAporta: 'la IPS receptora, en el ingreso',
    // Lo único que PULSO sabe del paciente. No es PII: ya viaja en CasoPublico
    // y no identifica a nadie. El dictado literal y el punto de recogida NO
    // están aquí — este constructor ni siquiera puede leerlos.
    contexto: { edad: caso.edad, sexo: caso.sexo },
  };
}

function huecoProfesional(caso: CasoPublico): HuecoRda {
  return {
    id: 'profesional-sin-identidad',
    perfil: PERFIL.profesional,
    elemento: 'Bundle.entry:PractitionerResource · Encounter.participant',
    severidad: 'bloqueante',
    queFalta:
      'El profesional: documento, nombre, registro RETHUS y afiliación SSO.',
    porQue:
      'Hoy la sesión de core es una contraseña compartida por turno: no hay usuarios. `unidad.tripulante` es un texto que escribe quien tenga esa contraseña, así que usarlo como nombre de profesional sería fabricar una identidad clínica. Se declara el hueco y se espera a la identidad real.',
    quienLoAporta: 'tarea 1.1 (identidad y actor real) · tarea 1.3 (sesión con actor)',
    contexto: {
      // El id del móvil no identifica a una persona: es el indicativo de radio.
      // El nombre del tripulante NO se copia aquí a propósito.
      movil: caso.unidad?.id ?? null,
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────

function calcularPeriodo(
  creadoEn: string,
  eventos: EventoTrasladoRda[],
): { inicio: string; fin: string | null } {
  const instantes = [creadoEn, ...eventos.map((e) => e.ocurridoEn)]
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .sort();
  const cierres = eventos
    .filter((e) => EVENTOS_DE_CIERRE.includes(e.tipo))
    .map((e) => e.ocurridoEn)
    .sort();
  return {
    inicio: instantes[0] ?? creadoEn,
    fin: cierres.length > 0 ? cierres[cierres.length - 1] : null,
  };
}

const PESO_SEVERIDAD: Record<HuecoRda['severidad'], number> = {
  bloqueante: 0,
  divergente: 1,
  'por-verificar': 2,
};

/** Primero lo que impide firmar. Dedupe por id: un hueco se dice una vez. */
function ordenarHuecos(huecos: HuecoRda[]): HuecoRda[] {
  const unicos = new Map<string, HuecoRda>();
  for (const h of huecos) if (!unicos.has(h.id)) unicos.set(h.id, h);
  return [...unicos.values()].sort(
    (a, b) =>
      PESO_SEVERIDAD[a.severidad] - PESO_SEVERIDAD[b.severidad] ||
      a.id.localeCompare(b.id),
  );
}

function calcularCobertura(presentes: string[]): CoberturaRda {
  const set = new Set(presentes);
  const exigidos = [...PERFILES_EXIGIDOS];
  const cubiertos = exigidos.filter((p) => set.has(p));
  return {
    exigidos,
    presentes: [...new Set(presentes)].sort(),
    ausentes: exigidos.filter((p) => !set.has(p)),
    proporcion:
      Math.round((cubiertos.length / exigidos.length) * 100) / 100,
  };
}

/**
 * UUID v5 (RFC 4122) derivado del `casoId`. Deterministas a propósito: el
 * borrador que se le muestra a un humano y el que firma tienen que ser el
 * mismo documento, y `randomUUID()` haría que cada GET produjera otro.
 */
function uuidDeterminista(semilla: string): string {
  const ns = Buffer.from(NAMESPACE_RDA.replace(/-/g, ''), 'hex');
  const h = createHash('sha1')
    .update(Buffer.concat([ns, Buffer.from(semilla, 'utf8')]))
    .digest();
  h[6] = (h[6] & 0x0f) | 0x50; // versión 5
  h[8] = (h[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = h.subarray(0, 16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
