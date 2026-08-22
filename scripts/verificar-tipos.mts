/**
 * ═══════════════════════════════════════════════════════════════════
 *  Verificador del espejo de tipos — tarea 0.7
 * ═══════════════════════════════════════════════════════════════════
 *
 *  `apps/frontend/lib/types.ts` es un ESPEJO MANUAL de
 *  `apps/backend/core/src/contracts/types.ts`. Son dos proyectos pnpm
 *  separados y no comparten paquete, así que TypeScript no los relaciona:
 *  cambiar uno solo compila perfecto en los dos lados.
 *
 *  Y ahí está el problema. No rompe el BUILD — rompe el RUNTIME, que es
 *  peor: el CI queda verde, el deploy sale, y el campo se entera en vivo
 *  cuando `caso.dxCie10` llega `undefined` en la pantalla del hospital.
 *  Está documentado como deuda en `docs/contrato-api.md` desde el principio.
 *
 *  QUÉ COMPARA
 *    La ESTRUCTURA, no el texto. Los dos archivos tienen comentarios
 *    distintos a propósito (el del front está en español con tildes, el de
 *    core sin ellas) y usan comillas distintas. Comparar texto daría rojo
 *    permanente, que es la forma más rápida de que alguien apague el check.
 *
 *    Se parsea con el compilador de TypeScript y de cada declaración
 *    exportada se saca una firma normalizada: nombres de miembros, si son
 *    opcionales, y el tipo con comentarios y espacios fuera.
 *
 *  LA DEUDA QUE YA EXISTÍA
 *    El espejo llevaba tiempo divergido cuando se escribió esto. Esos casos
 *    viven en `TOLERADOS`, cada uno con su razón — no se borran, se declaran.
 *    Un check que nace rojo se apaga en una semana; uno que nace verde
 *    detiene la divergencia NUEVA, que es la que todavía se puede evitar.
 *    `--estricto` los cuenta también, para el día que se quiera saldar.
 *
 *  USO
 *    node scripts/verificar-tipos.mts              # falla si hay divergencia nueva
 *    node scripts/verificar-tipos.mts --estricto   # falla también con la deuda vieja
 *    node --test scripts/verificar-tipos.test.mts # los tests del verificador
 *
 *  ⚠️ `.mts` y no `.ts` a propósito: el package.json de la raíz no declara
 *     `"type": "module"`, así que Node reparsea un `.ts` con imports y avisa
 *     con MODULE_TYPELESS_PACKAGE_JSON en cada corrida. Poner `"type":
 *     "module"` en la raíz tocaría la app de Next que cuelga de ahí; `.mts`
 *     no toca nada y el tsconfig de la raíz ya lo incluye.
 */

import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CORE = 'apps/backend/core/src/contracts/types.ts';
const ESPEJO = 'apps/frontend/lib/types.ts';

/**
 * Divergencias que YA EXISTÍAN cuando se escribió el verificador.
 *
 * Cada una lleva su razón. Si una razón es "todavía nadie lo mira", es deuda
 * y hay que saldarla; si es "el front no puede verlo", es una decisión y se
 * queda. La diferencia importa: la primera se borra de esta lista algún día,
 * la segunda no.
 */
export const TOLERADOS: Array<{ nombre: string; lado: 'solo-core' | 'solo-espejo'; porque: string }> = [
  // ── Cuerpos de petición: el front los arma inline, no los importa ──
  { nombre: 'TriageRequest', lado: 'solo-core', porque: 'el front arma el cuerpo inline en lib/api.ts' },
  { nombre: 'MatchRequest', lado: 'solo-core', porque: 'el front arma el cuerpo inline en lib/api.ts' },
  { nombre: 'DispatchRequest', lado: 'solo-core', porque: 'el front arma el cuerpo inline en lib/api.ts' },
  { nombre: 'RespondRequest', lado: 'solo-core', porque: 'el front arma el cuerpo inline en lib/api.ts' },
  { nombre: 'EscalarRequest', lado: 'solo-core', porque: 'el front arma el cuerpo inline en lib/api.ts' },
  { nombre: 'AtenderEscalamientoRequest', lado: 'solo-core', porque: 'el front arma el cuerpo inline en lib/api.ts' },

  // ── Kernel de ruteo: estado de servidor, no cruza el cable ──
  { nombre: 'ErrorApi', lado: 'solo-core', porque: 'el front usa PulsoErrorEnvelope, no esta forma vieja' },
  { nombre: 'PulsoCode', lado: 'solo-core', porque: 'el front compara el string crudo; espejarlo es tarea aparte' },
  { nombre: 'PulsoErrorEnvelope', lado: 'solo-core', porque: 'idem PulsoCode' },
  { nombre: 'CaseRoutingState', lado: 'solo-core', porque: 'maquina de estados interna del kernel de ruteo' },
  { nombre: 'HandshakeRoutingState', lado: 'solo-core', porque: 'maquina de estados interna del kernel de ruteo' },
  { nombre: 'IdempotencyInput', lado: 'solo-core', porque: 'lo pone lib/api.ts, no lo declara el contrato del front' },
  {
    nombre: 'RoutingDecisionEvidence',
    lado: 'solo-core',
    porque:
      'evidencia de auditoria: hoy no sale del servidor. La vista forense 4.12 la va a necesitar y ahi se espeja',
  },

  // ── Respuestas que core sirve pero no declara en el contrato ──
  { nombre: 'CongestionSede', lado: 'solo-espejo', porque: 'lo produce el geovisor del CRUE, no el contrato de core' },
  { nombre: 'TranscribirResponse', lado: 'solo-espejo', porque: 'respuesta de voz.client.ts, sin tipo en contracts' },
  { nombre: 'PasoNavegacion', lado: 'solo-espejo', porque: 'respuesta de eta/ruta, sin tipo en contracts' },
  { nombre: 'RutaResponse', lado: 'solo-espejo', porque: 'respuesta de eta/ruta, sin tipo en contracts' },
  { nombre: 'EstadoResponse', lado: 'solo-espejo', porque: 'respuesta de estado.service.ts, sin tipo en contracts' },
];

// ─────────────────────────────────────────────────────────────────
// Firmas
// ─────────────────────────────────────────────────────────────────

type Clase = 'interface' | 'type' | 'enum' | 'const' | 'funcion' | 'class';

export interface Firma {
  clase: Clase;
  /** Solo para interfaces y enums: miembro → tipo normalizado. */
  miembros: Map<string, string>;
  /** Para alias de tipo: el tipo entero normalizado. */
  cuerpo: string;
  linea: number;
}

/**
 * Quita todo lo que puede diferir sin cambiar el significado.
 *
 * Comentarios (los dos archivos los tienen distintos a propósito), comillas
 * (core usa simples, el front dobles), espacios, y las comas o punto y coma
 * de separación dentro de un tipo objeto.
 */
function normalizar(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}();:,|&<>[\]?=])\s*/g, '$1')
    .replace(/[;,]}/g, '}')
    .trim();
}

export function firmas(rutaRelativa: string): Map<string, Firma> {
  return firmasDeTexto(readFileSync(resolve(RAIZ, rutaRelativa), 'utf8'), rutaRelativa);
}

/** El mismo parseo, sobre texto. Es por donde entran los tests. */
export function firmasDeTexto(texto: string, nombre = 'anonimo.ts'): Map<string, Firma> {
  const fuente = ts.createSourceFile(nombre, texto, ts.ScriptTarget.Latest, true);

  const encontradas = new Map<string, Firma>();
  const linea = (nodo: ts.Node) =>
    fuente.getLineAndCharacterOfPosition(nodo.getStart(fuente)).line + 1;

  const exportado = (nodo: ts.Node) =>
    ts.canHaveModifiers(nodo) &&
    ts
      .getModifiers(nodo)
      ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  for (const nodo of fuente.statements) {
    if (!exportado(nodo)) continue;

    if (ts.isInterfaceDeclaration(nodo)) {
      const miembros = new Map<string, string>();
      for (const m of nodo.members) {
        const nombre = m.name ? m.name.getText(fuente) : normalizar(m.getText(fuente));
        const opcional = 'questionToken' in m && m.questionToken ? '?' : '';
        const tipo =
          'type' in m && m.type ? normalizar((m.type as ts.TypeNode).getText(fuente)) : 'unknown';
        miembros.set(nombre + opcional, tipo);
      }
      const hereda = (nodo.heritageClauses ?? [])
        .map((h) => normalizar(h.getText(fuente)))
        .join(' ');
      encontradas.set(nodo.name.text, {
        clase: 'interface',
        miembros,
        cuerpo: hereda,
        linea: linea(nodo),
      });
      continue;
    }

    if (ts.isTypeAliasDeclaration(nodo)) {
      encontradas.set(nodo.name.text, {
        clase: 'type',
        miembros: new Map(),
        cuerpo: normalizar(nodo.type.getText(fuente)),
        linea: linea(nodo),
      });
      continue;
    }

    if (ts.isEnumDeclaration(nodo)) {
      const miembros = new Map<string, string>();
      for (const m of nodo.members) {
        miembros.set(
          m.name.getText(fuente),
          m.initializer ? normalizar(m.initializer.getText(fuente)) : '',
        );
      }
      encontradas.set(nodo.name.text, { clase: 'enum', miembros, cuerpo: '', linea: linea(nodo) });
      continue;
    }

    if (ts.isVariableStatement(nodo)) {
      for (const d of nodo.declarationList.declarations) {
        encontradas.set(d.name.getText(fuente), {
          clase: 'const',
          miembros: new Map(),
          cuerpo: normalizar(
            d.type?.getText(fuente) ?? d.initializer?.getText(fuente) ?? '',
          ),
          linea: linea(nodo),
        });
      }
      continue;
    }

    if (ts.isFunctionDeclaration(nodo) && nodo.name) {
      encontradas.set(nodo.name.text, {
        clase: 'funcion',
        miembros: new Map(),
        cuerpo: normalizar(
          `(${nodo.parameters.map((p) => p.getText(fuente)).join(',')})=>${nodo.type?.getText(fuente) ?? 'void'}`,
        ),
        linea: linea(nodo),
      });
      continue;
    }

    if (ts.isClassDeclaration(nodo) && nodo.name) {
      encontradas.set(nodo.name.text, {
        clase: 'class',
        miembros: new Map(),
        cuerpo: normalizar(nodo.getText(fuente)),
        linea: linea(nodo),
      });
    }
  }

  return encontradas;
}

// ─────────────────────────────────────────────────────────────────
// Comparación
// ─────────────────────────────────────────────────────────────────

export interface Divergencia {
  nombre: string;
  detalle: string[];
  /** Qué hacer. Un check que solo dice "falló" obliga a adivinar. */
  arreglo: string;
}

export function comparar(
  enCore: Map<string, Firma>,
  enEspejo: Map<string, Firma>,
  tolerar: boolean,
): { rotas: Divergencia[]; toleradas: string[] } {
  const rotas: Divergencia[] = [];
  const toleradas: string[] = [];

  const permitido = (nombre: string, lado: 'solo-core' | 'solo-espejo') =>
    TOLERADOS.some((t) => t.nombre === nombre && t.lado === lado);

  for (const [nombre, firma] of enCore) {
    if (enEspejo.has(nombre)) continue;
    if (tolerar && permitido(nombre, 'solo-core')) {
      toleradas.push(`${nombre} — solo en core — ${razon(nombre)}`);
      continue;
    }
    rotas.push({
      nombre,
      detalle: [`está en core (${CORE}:${firma.linea}) y NO en el espejo`],
      arreglo: `copia la declaración de \`${nombre}\` a ${ESPEJO}`,
    });
  }

  for (const [nombre, firma] of enEspejo) {
    if (enCore.has(nombre)) continue;
    if (tolerar && permitido(nombre, 'solo-espejo')) {
      toleradas.push(`${nombre} — solo en el espejo — ${razon(nombre)}`);
      continue;
    }
    rotas.push({
      nombre,
      detalle: [`está en el espejo (${ESPEJO}:${firma.linea}) y NO en core`],
      arreglo:
        `o lo declaras en ${CORE} (avisando al equipo antes: ese archivo es ley),\n` +
        `      o lo sacas del espejo si no es parte del contrato`,
    });
  }

  for (const [nombre, a] of enCore) {
    const b = enEspejo.get(nombre);
    if (!b) continue;

    const detalle: string[] = [];

    if (a.clase !== b.clase) {
      detalle.push(`core lo declara como \`${a.clase}\` y el espejo como \`${b.clase}\``);
    }

    if (a.cuerpo !== b.cuerpo) {
      detalle.push(`core   : ${a.cuerpo || '(vacío)'}`);
      detalle.push(`espejo : ${b.cuerpo || '(vacío)'}`);
    }

    for (const [miembro, tipo] of a.miembros) {
      if (!b.miembros.has(miembro)) {
        detalle.push(`falta en el espejo: \`${miembro}: ${tipo}\``);
      } else if (b.miembros.get(miembro) !== tipo) {
        detalle.push(
          `\`${miembro}\` cambió de tipo — core: \`${tipo}\` · espejo: \`${b.miembros.get(miembro)}\``,
        );
      }
    }
    for (const [miembro, tipo] of b.miembros) {
      if (!a.miembros.has(miembro)) {
        detalle.push(`sobra en el espejo: \`${miembro}: ${tipo}\``);
      }
    }

    if (detalle.length > 0) {
      rotas.push({
        nombre,
        detalle,
        arreglo:
          `deja \`${nombre}\` idéntico en los dos. Core manda: ${CORE}:${a.linea} → ${ESPEJO}:${b.linea}.\n` +
          `      Si el campo es nuevo, va OPCIONAL en los dos lados (regla 1 del AGENTS.md)`,
      });
    }
  }

  return { rotas: rotas.sort((x, y) => x.nombre.localeCompare(y.nombre)), toleradas };
}

const razon = (nombre: string) =>
  TOLERADOS.find((t) => t.nombre === nombre)?.porque ?? 'sin razón declarada';

// ─────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────

/**
 * Solo cuando este archivo es el que se invocó. Importado desde un test,
 * `process.exit()` mataría al corredor antes de la primera aserción.
 */
const esEntrada =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (esEntrada) principal();

function principal(): void {
const estricto = process.argv.includes('--estricto');
const arranque = performance.now();

const enCore = firmas(CORE);
const enEspejo = firmas(ESPEJO);
const { rotas, toleradas } = comparar(enCore, enEspejo, !estricto);

const ms = Math.round(performance.now() - arranque);

if (rotas.length === 0) {
  console.log(
    `✔ El espejo de tipos coincide — ${enCore.size} declaraciones en core, ` +
      `${enEspejo.size} en el espejo (${ms} ms).`,
  );
  if (toleradas.length > 0) {
    console.log(
      `\n  ${toleradas.length} divergencias toleradas, heredadas de antes del check.\n` +
        `  Corre \`--estricto\` para verlas como error y saldarlas:\n`,
    );
    for (const t of toleradas) console.log(`    · ${t}`);
  }
  process.exit(0);
}

console.error(`\n✖ El espejo de tipos divergió — ${rotas.length} declaración(es).\n`);
console.error(`  dueño del contrato : ${CORE}`);
console.error(`  espejo manual      : ${ESPEJO}\n`);
console.error(
  `  Compila igual en los dos lados. Lo que rompe es el RUNTIME: el build pasa,\n` +
    `  el deploy sale, y el campo se entera en vivo.\n`,
);

for (const d of rotas) {
  console.error(`  ── ${d.nombre} ${'─'.repeat(Math.max(0, 58 - d.nombre.length))}`);
  for (const linea of d.detalle) console.error(`     ${linea}`);
  console.error(`     → ${d.arreglo}\n`);
}

console.error(
  `  Recuerda la regla 1 del AGENTS.md: \`contracts/types.ts\` no se cambia en\n` +
    `  silencio, y todo campo nuevo va OPCIONAL.\n`,
);

process.exit(1);
}
