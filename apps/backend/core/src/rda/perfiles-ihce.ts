/**
 * URLs canónicas de la guía de implementación del RDA — IHCE Colombia.
 *
 * ═══ DE DÓNDE SALEN ═══════════════════════════════════════════════
 * Todas se transcribieron de la guía navegable el 2026-08-22:
 *   https://vulcano.ihcecol.gov.co/indexRDA   (RDA v1.0.0)
 * Cada constante trae la página exacta de la que se leyó. **Ninguna URL de
 * aquí está inventada.** Si un día hace falta una que no está, se abre la
 * guía y se copia — no se deduce del patrón.
 *
 * ═══ POR QUÉ IMPORTA ══════════════════════════════════════════════
 * La Res. 1888 de 2025 obliga a todo prestador REPS a interoperar en HL7 FHIR
 * R4 contra el IHCE. El plazo venció el 15 de abril de 2026. PULSO produce en
 * la escena buena parte del contenido de un RDA de urgencias.
 *
 * ⚠️ Y LO QUE NO SE DICE: **PULSO PRE-LLENA el RDA. PULSO NO REPORTA AL IHCE.**
 * Está sin verificar (punto 3 del §0 del plan maestro) si un traslado
 * prehospitalario genera RDA propio o si solo lo genera la IPS receptora.
 * Hasta que eso se confirme por escrito, ni el código ni la API ni el pitch
 * pueden decir "reportamos". Prometer un reporte oficial que no se está
 * haciendo es lo que hunde una demo ante alguien de MinSalud.
 */

/** Identidad de la guía contra la que se construyó este módulo. */
export const GUIA_RDA = {
  nombre: 'Guía de Implementación RDA — IHCE Colombia',
  version: '1.0.0',
  navegable: 'https://vulcano.ihcecol.gov.co/indexRDA',
} as const;

/**
 * Perfiles (StructureDefinition). URL canónica leída del recuadro "Defining
 * URL" de cada página `StructureDefinition-<nombre>.html`.
 */
export const PERFIL = {
  /** Bundle-.../BundleEmergencyRDA — `type` fijo en `document`, `entry` 5..* */
  bundleUrgencias:
    'https://fhir.minsalud.gov.co/rda/StructureDefinition/BundleEmergencyRDA',
  /** El documento en sí: secciones 12..13, `title` fijo "RDA Urgencias". */
  composicionUrgencias:
    'https://fhir.minsalud.gov.co/rda/StructureDefinition/CompositionEmergencyRDA',
  /** El encuentro de urgencias. `status` fijo `finished`, `class` fijo `EMER`. */
  encuentroUrgencias:
    'https://fhir.minsalud.gov.co/rda/StructureDefinition/EncounterEmergencyRDA',
  /** Triage. `status` fijo `final`, `code` fijo SNOMED 225390008. */
  triage:
    'https://fhir.minsalud.gov.co/rda/StructureDefinition/ObservationTriageRDA',
  /** Diagnóstico. Exige `code.coding:ICD10` 1..1. */
  condicion:
    'https://fhir.minsalud.gov.co/rda/StructureDefinition/ConditionRDA',
  /** Orden de servicio. Ojo: liga `code` a CUPS, no a REPS. Ver constructor. */
  ordenServicio:
    'https://fhir.minsalud.gov.co/rda/StructureDefinition/ServiceRequestRDA',
  /** La IPS. Exige 2..2 identificadores: NIT + código de habilitación REPS. */
  ips: 'https://fhir.minsalud.gov.co/rda/StructureDefinition/CareDeliveryOrganizationRDA',
  /** El profesional. Exige documento, RETHUS y SSO. PULSO no tiene ninguno. */
  profesional:
    'https://fhir.minsalud.gov.co/rda/StructureDefinition/PractitionerRDA',
  /** El paciente. PULSO es seudónimo por diseño: este perfil es un hueco. */
  paciente:
    'https://fhir.minsalud.gov.co/rda/StructureDefinition/PatientRDA',
  /** Procedimientos (CUPS). PULSO no captura CUPS en la escena. */
  procedimiento:
    'https://fhir.minsalud.gov.co/rda/StructureDefinition/ProcedureRDA',
} as const;

/** CodeSystems del IHCE. Leídos de las páginas de perfil y de CodeSystem. */
export const CODESYSTEM = {
  /** 01..05 → Triage I..V. Verificado en CodeSystem-ClaseTriage.html. */
  claseTriage: 'https://fhir.minsalud.gov.co/rda/CodeSystem/ClaseTriage',
  /**
   * 130 conceptos de servicios habilitados. Es el mismo canonical que ya cita
   * `catalogo/servicios-reps.ts` — por eso sabemos que las demás URLs de este
   * archivo están bien formadas: esta se verificó dos veces, por dos caminos.
   */
  serviciosReps:
    'https://fhir.minsalud.gov.co/rda/CodeSystem/REPShealthcareServices',
  /** El tipo de identificador de una organización (`CodigoPrestador`, NIT…). */
  identificadoresOrganizacion:
    'https://fhir.minsalud.gov.co/rda/CodeSystem/ColombianOrganizationIdentifiers',
  /** Modalidad de la atención. Exigido 1..1 en Encounter.type — sin verificar sus códigos. */
  modalidad:
    'https://fhir.minsalud.gov.co/rda/CodeSystem/ColombianTechModality',
  /** Grupo de servicios. Exigido 1..1 en Encounter.type — sin verificar sus códigos. */
  grupoServicios:
    'https://fhir.minsalud.gov.co/rda/CodeSystem/GrupoServicios',
  /** Entorno de la atención. Exigido 1..1 en Encounter.type — sin verificar sus códigos. */
  entornoAtencion:
    'https://fhir.minsalud.gov.co/rda/CodeSystem/EntornoAtencion',
  /** Finalidad de la consulta (RIPS v2). Exigido en ServiceRequest.reasonCode. */
  finalidadConsulta:
    'https://fhir.minsalud.gov.co/rda/CodeSystem/RIPSFinalidadConsultaVersion2',
  /** CUPS. Lo exige ProcedureRDA y ServiceRequestRDA.code. PULSO no lo produce. */
  cups: 'https://fhir.minsalud.gov.co/rda/CodeSystem/CUPS',
} as const;

/** NamingSystems del IHCE. */
export const NAMINGSYSTEM = {
  /** Identificador de prestador en el REPS. */
  reps: 'https://fhir.minsalud.gov.co/rda/NamingSystem/REPS',
} as const;

/** Systems del estándar (no colombianos). No hace falta verificarlos: son R4. */
export const SISTEMA = {
  snomed: 'http://snomed.info/sct',
  loinc: 'http://loinc.org',
  icd10: 'http://hl7.org/fhir/sid/icd-10',
  claseActo: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  estadoClinico: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
  estadoVerificacion:
    'http://terminology.hl7.org/CodeSystem/condition-ver-status',
  razonSeccionVacia: 'http://terminology.hl7.org/CodeSystem/list-empty-reason',
} as const;

/** Códigos fijos que el perfil impone y que sí pudimos leer. */
export const CODIGO = {
  /** Composition.type — LOINC "Patient summary Document". */
  tipoDocumentoRda: '60591-5',
  /** Observation.code — SNOMED CT, la observación de triaje. */
  observacionTriage: '225390008',
  /** Encounter.class — urgencias. */
  claseUrgencias: 'EMER',
  /** Identifier.type de una organización, para el código de habilitación. */
  codigoPrestador: 'CodigoPrestador',
  /** List.emptyReason cuando una sección obligatoria va vacía. */
  seccionSinDatos: 'nilknown',
} as const;

/** Composition.title — el perfil lo fija con este texto exacto. */
export const TITULO_RDA_URGENCIAS = 'RDA Urgencias';

/**
 * Nivel de triage (Res. 5596/2015) → código del CodeSystem ClaseTriage.
 * Transcrito de CodeSystem-ClaseTriage.html: los cinco códigos van con cero a
 * la izquierda. `1` NO es `'1'` — es `'01'`, y un validador lo rechaza.
 */
export const TRIAGE_A_CLASE: Readonly<
  Record<1 | 2 | 3 | 4 | 5, { code: string; display: string }>
> = {
  1: { code: '01', display: 'Triage I' },
  2: { code: '02', display: 'Triage II' },
  3: { code: '03', display: 'Triage III' },
  4: { code: '04', display: 'Triage IV' },
  5: { code: '05', display: 'Triage V' },
};

/**
 * Secciones de CompositionEmergencyRDA cuyo código LOINC pudimos LEER.
 *
 * ⚠️ El perfil exige **12..13 secciones** con slicing cerrado. La guía
 * navegable trunca la tabla y solo rindió estas seis. Las otras seis o siete
 * NO se inventan: salen como hueco `por-verificar` y las tiene que enumerar la
 * tarea 4.9 contra el StructureDefinition. Un código LOINC adivinado es
 * exactamente el tipo de dato falso que esta tarea existe para no producir.
 */
export const SECCIONES_VERIFICADAS = [
  { slice: 'sectionProblems', loinc: '11450-4', titulo: 'Problemas' },
  { slice: 'sectionPayers', loinc: '48768-6', titulo: 'Fuentes de pago' },
  {
    slice: 'sectionHistoryOfOccupation',
    loinc: '74208-0',
    titulo: 'Ocupación',
  },
  {
    slice: 'sectionAttendanceAllowance',
    loinc: '105583-9',
    titulo: 'Incapacidad',
  },
  { slice: 'sectionMedications', loinc: '10160-0', titulo: 'Medicamentos' },
  { slice: 'sectionAllergies', loinc: '48765-2', titulo: 'Alergias' },
] as const;

/** Cuántas secciones exige el perfil, para poder decir cuántas faltan. */
export const SECCIONES_EXIGIDAS_MIN = 12;
