/**
 * Tipos FHIR R4 — los mínimos que necesita el RDA de urgencias.
 *
 * ¿Por qué escritos a mano y no `@types/fhir` o un SDK?
 * Porque un `Bundle` de seis perfiles es menos código que la integración de una
 * librería, y porque estos tipos tienen que ser LEGIBLES por alguien que está
 * comparando el resultado contra la guía del IHCE en la pantalla de al lado.
 * Un tipo generado de 20.000 líneas no se lee; este sí.
 *
 * Los nombres de recurso y de campo van en INGLÉS y en su forma oficial
 * (`resourceType`, `Encounter`, `valueCodeableConcept`). Eso no rompe la regla
 * 7 del repo: no es dominio nuestro, es el estándar. Lo que sí va en español
 * es todo lo que PULSO inventa alrededor (ver `borrador.ts`).
 *
 * Es un SUBCONJUNTO deliberado: solo los elementos que el constructor emite o
 * que el perfil exige. Si falta uno, es porque nadie lo llena todavía — y eso
 * se declara como hueco, no se agrega un campo vacío.
 */

// ─────────────────────────────────────────────────────────────────
// Tipos de dato
// ─────────────────────────────────────────────────────────────────

export interface Coding {
  system?: string;
  code?: string;
  display?: string;
}

export interface CodeableConcept {
  coding?: Coding[];
  text?: string;
}

export interface Identifier {
  use?: 'usual' | 'official' | 'temp' | 'secondary' | 'old';
  type?: CodeableConcept;
  system?: string;
  value?: string;
}

/**
 * Dentro de un Bundle de tipo `document` las referencias apuntan al `fullUrl`
 * de otra entrada (`urn:uuid:...`). Que TODA referencia emitida resuelva
 * contra una entrada del mismo Bundle es un invariante de este módulo: si un
 * recurso no existe, la referencia NO se emite y en su lugar sale un hueco.
 * Una referencia colgando es peor que un campo ausente — miente en silencio.
 */
export interface Reference {
  reference?: string;
  display?: string;
}

export interface Meta {
  profile?: string[];
  tag?: Coding[];
}

export interface Period {
  start?: string;
  end?: string;
}

export interface Address {
  use?: 'home' | 'work' | 'temp' | 'old' | 'billing';
  type?: 'postal' | 'physical' | 'both';
  line?: string[];
  city?: string;
  district?: string;
  state?: string;
  country?: string;
}

export interface RecursoFhir {
  resourceType: string;
  id: string;
  meta?: Meta;
}

// ─────────────────────────────────────────────────────────────────
// Recursos
// ─────────────────────────────────────────────────────────────────

/** Sección de un Composition. `emptyReason` es obligatorio si va vacía (cmp-2). */
export interface CompositionSection {
  title?: string;
  code: CodeableConcept;
  entry?: Reference[];
  emptyReason?: CodeableConcept;
}

export interface Composition extends RecursoFhir {
  resourceType: 'Composition';
  /**
   * `preliminary` mientras nadie firme. No es un detalle: es la regla 6 del
   * repo escrita en el estándar. La firma humana (tarea 4.10) es lo que lo
   * pasa a `final`.
   */
  status: 'registered' | 'partial' | 'preliminary' | 'final' | 'amended';
  type: CodeableConcept;
  subject?: Reference;
  encounter?: Reference;
  date: string;
  author?: Reference[];
  title: string;
  custodian?: Reference;
  section?: CompositionSection[];
}

export interface EncounterDiagnosis {
  condition: Reference;
  use?: CodeableConcept;
}

export interface Encounter extends RecursoFhir {
  resourceType: 'Encounter';
  status:
    | 'planned'
    | 'arrived'
    | 'triaged'
    | 'in-progress'
    | 'onleave'
    | 'finished'
    | 'cancelled';
  class: Coding;
  type?: CodeableConcept[];
  subject?: Reference;
  period?: Period;
  reasonCode?: CodeableConcept[];
  diagnosis?: EncounterDiagnosis[];
  serviceProvider?: Reference;
}

export interface Observation extends RecursoFhir {
  resourceType: 'Observation';
  status: 'registered' | 'preliminary' | 'final' | 'amended';
  code: CodeableConcept;
  subject?: Reference;
  encounter?: Reference;
  effectiveDateTime?: string;
  valueCodeableConcept?: CodeableConcept;
}

export interface Condition extends RecursoFhir {
  resourceType: 'Condition';
  clinicalStatus?: CodeableConcept;
  verificationStatus?: CodeableConcept;
  code?: CodeableConcept;
  subject?: Reference;
  encounter?: Reference;
  recordedDate?: string;
}

export interface ServiceRequest extends RecursoFhir {
  resourceType: 'ServiceRequest';
  status: 'draft' | 'active' | 'on-hold' | 'revoked' | 'completed';
  intent: 'proposal' | 'plan' | 'order';
  category?: CodeableConcept[];
  code?: CodeableConcept;
  subject?: Reference;
  encounter?: Reference;
  authoredOn?: string;
  reasonCode?: CodeableConcept[];
}

export interface Organization extends RecursoFhir {
  resourceType: 'Organization';
  identifier?: Identifier[];
  active?: boolean;
  type?: CodeableConcept[];
  name?: string;
  address?: Address[];
}

/** Todo lo que este módulo sabe meter en un Bundle. */
export type RecursoRda =
  | Composition
  | Encounter
  | Observation
  | Condition
  | ServiceRequest
  | Organization;

// ─────────────────────────────────────────────────────────────────
// Bundle
// ─────────────────────────────────────────────────────────────────

export interface EntradaBundle {
  /** `urn:uuid:<uuid>`. Es la clave contra la que resuelven las referencias. */
  fullUrl: string;
  resource: RecursoRda;
}

export interface Bundle {
  resourceType: 'Bundle';
  id: string;
  meta?: Meta;
  identifier?: Identifier;
  /** El RDA es un documento clínico: `document`, no `collection` ni `batch`. */
  type: 'document';
  timestamp: string;
  /** La PRIMERA entrada de un Bundle `document` es siempre el Composition. */
  entry: EntradaBundle[];
}
