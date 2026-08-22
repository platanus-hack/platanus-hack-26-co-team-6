/**
 * Dictado en crudo → entidades clínicas estructuradas. CARRIL DE NEID.
 *
 * Sin ANTHROPIC_API_KEY cae a un extractor heurístico por palabras clave (ver
 * `extraccionHeuristica`). Es tosco pero suficiente para que el resto del
 * equipo trabaje sin depender de nadie.
 *
 * ⚠️ NOTA DE ARQUITECTURA: esto vive en core y sigue siendo TypeScript porque
 *    la mudanza desde Next fue un port, no una reescritura. El destino natural
 *    a mediano plazo es apps/backend/ai-core (FastAPI), que ya existe y es el
 *    servicio de IA declarado. Mover esto allá SÍ es una reescritura a Python:
 *    decisión de producto, no de refactor.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type {
  Caso,
  ExtraccionClinica,
  TriageRequest,
  TriageResponse,
} from '../contracts/types';
import {
  SERVICIOS as S,
  SERVICIOS_SELECCIONABLES,
  nombreServicio,
} from '../catalogo/servicios-reps';
import { ORIGEN_DEMO } from '../sedes/semillas';
import { AlmacenService } from '../almacen/almacen.service';
import { extraccionHeuristica } from './triage-heuristico';

// ─────────────────────────────────────────────────────────────────
// Esquema que Claude debe llenar. Espeja ExtraccionClinica en contracts.
// Si cambias uno, cambia el otro.
// ─────────────────────────────────────────────────────────────────

const EsquemaExtraccion = z.object({
  resumen: z
    .string()
    .describe('Una linea, como la diria un medico por radio. Maximo 140 caracteres.'),
  triage: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe(
      'Nivel de triage segun Resolucion 5596 de 2015 de Colombia. ' +
        '1=atencion inmediata por riesgo vital. 2=maximo 30 min. 3=maximo 120 min. ' +
        '4=maximo 240 min. 5=maximo 360 min.',
    ),
  dxCie10: z
    .string()
    .nullable()
    .describe("Codigo CIE-10 mas probable, ej 'I21.1'. null si el dictado no alcanza."),
  dxDescripcion: z.string().describe('Diagnostico probable en palabras.'),
  serviciosRequeridos: z
    .array(z.number().int())
    .describe(
      'Codigos de servicio REPS que la sede receptora DEBE tener habilitados. ' +
        'Usar UNICAMENTE codigos de la lista permitida. No incluir 1102 (urgencias): ' +
        'se agrega solo. Solo lo estrictamente necesario para resolver este caso.',
    ),
  complejidadRequerida: z.enum(['baja', 'media', 'alta']),
  edad: z.number().int().nullable(),
  sexo: z.enum(['M', 'F', 'desconocido']),
  signosAlarma: z
    .array(z.string())
    .describe('Hallazgos concretos que justifican el nivel de triage. Maximo 4.'),
  requiereMedicoABordo: z
    .boolean()
    .describe(
      'true si el paciente necesita medico durante el traslado ' +
        '(inestabilidad hemodinamica, via aerea comprometida, Glasgow bajo, ' +
        'infusiones vasoactivas). Obliga movil TAM.',
    ),
  confianza: z
    .number()
    .min(0)
    .max(1)
    .describe('Que tan seguro estas de esta extraccion, 0 a 1.'),
});

const PROMPT_SISTEMA = `Eres el motor de extraccion clinica de PULSO, un sistema colombiano de ruteo de urgencias.

Recibes el dictado de un paramedico o medico de urgencias, en espanol colombiano, con jerga clinica, abreviaturas y errores de transcripcion de voz. Devuelves entidades estructuradas.

CONTEXTO NORMATIVO:
- Triage segun Resolucion 5596 de 2015 (Colombia), 5 niveles.
- Los servicios se identifican con codigos del REPS (Registro Especial de Prestadores de Servicios de Salud) de MinSalud.

CODIGOS DE SERVICIO PERMITIDOS (no inventes otros):
${SERVICIOS_SELECCIONABLES.map((c) => `  ${c} = ${nombreServicio(c)}`).join('\n')}

REGLAS:
1. Solo pide servicios que este caso realmente necesita para resolverse.
   Un infarto con supradesnivel del ST necesita ${S.HEMODINAMIA} (hemodinamia) y ${S.UCI_ADULTOS} (UCI adultos).
   Un ACV necesita ${S.NEUROCIRUGIA} (neurocirugia), ${S.UCI_ADULTOS} e ${S.IMAGENES_IONIZANTES} (imagenes).
   Un politrauma pediatrico necesita ${S.CIRUGIA_GENERAL} (cirugia general) y ${S.UCI_PEDIATRICO} (UCI pediatrica).
   No pidas UCI si el paciente esta estable y no la necesita: pedir de mas descarta sedes viables.
2. No incluyas 1102 (urgencias) en serviciosRequeridos: el sistema lo agrega siempre.
3. Si el dictado no da la edad o el sexo, devuelve null / "desconocido". No inventes.
4. Si el dictado es ambiguo o muy corto, baja la confianza. Es preferible confianza baja que un dato inventado.
5. Ante duda entre dos niveles de triage, escoge el MAS grave. En urgencias el falso negativo mata.
6. NUNCA inventes un codigo CIE-10. Si no estas seguro, devuelve null en dxCie10 y describe el cuadro en dxDescripcion.`;

// ─────────────────────────────────────────────────────────────────

@Injectable()
export class TriageService {
  private readonly log = new Logger(TriageService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly almacen: AlmacenService,
  ) {}

  async procesar(cuerpo: TriageRequest, texto: string): Promise<TriageResponse> {
    const t0 = Date.now();

    let extraccion: ExtraccionClinica;
    try {
      extraccion = this.config.get<string>('ANTHROPIC_API_KEY')
        ? await this.extraerConClaude(texto)
        : extraccionHeuristica(texto);
    } catch (e) {
      this.log.error(`triage falló, usando heurística: ${String(e)}`);
      extraccion = extraccionHeuristica(texto);
    }

    const caso: Caso = {
      ...extraccion,
      id: randomUUID(),
      textoCrudo: texto,
      origen: cuerpo.origen ?? ORIGEN_DEMO,
      // Si el paciente requiere médico a bordo, el móvil tiene que ser TAM.
      tipoMovil:
        cuerpo.tipoMovil ?? (extraccion.requiereMedicoABordo ? 'TAM' : 'TAB'),
      creadoEn: new Date().toISOString(),
    };

    this.almacen.guardarCaso(caso);

    return { caso, latenciaMs: Date.now() - t0 };
  }

  private async extraerConClaude(texto: string): Promise<ExtraccionClinica> {
    const client = new Anthropic({
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY'),
    });

    const res = await client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 2048,
      system: PROMPT_SISTEMA,
      messages: [{ role: 'user', content: `Dictado:\n"""${texto}"""` }],
      output_config: {
        format: zodOutputFormat(EsquemaExtraccion),
        // "low" para latencia: es el número que sale en el pitch. Si la calidad
        // de extracción falla, subir a "medium" y medir de nuevo.
        effort: 'low',
      },
    });

    if (!res.parsed_output) {
      throw new Error('Claude no devolvió salida parseable');
    }

    const p = res.parsed_output;
    return {
      resumen: p.resumen,
      triage: p.triage as ExtraccionClinica['triage'],
      dxCie10: p.dxCie10,
      dxDescripcion: p.dxDescripcion,
      // Cinturón de seguridad: filtramos cualquier código fuera del catálogo.
      serviciosRequeridos: p.serviciosRequeridos.filter((c) =>
        SERVICIOS_SELECCIONABLES.includes(c),
      ),
      complejidadRequerida: p.complejidadRequerida,
      edad: p.edad,
      sexo: p.sexo,
      signosAlarma: p.signosAlarma.slice(0, 4),
      requiereMedicoABordo: p.requiereMedicoABordo,
      confianza: p.confianza,
    };
  }
}
