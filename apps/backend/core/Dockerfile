# core — el dominio (NestJS). INTERNO: nunca debe quedar con cara pública.
#
# ⚠️ EL CONTEXTO DE BUILD ES LA RAÍZ DEL REPO, no esta carpeta.
#    render.yaml:  dockerfilePath: ./apps/backend/core/Dockerfile
#                  dockerContext:  .
#    Construir a mano:  docker build -f apps/backend/core/Dockerfile .
#    Si lo corres desde aquí, el COPY de `data/` falla y no vas a entender por qué.

# ── build: compila TypeScript, necesita las devDependencies ──────────────
FROM node:24-slim AS build

# pnpm fijo: el mismo que declara apps/frontend/package.json. Sin fijarlo,
# corepack toma el último y el lockfile 9.0 se resuelve distinto en cada build.
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate

WORKDIR /app

# Manifiestos primero: cambiar código no reinstala node_modules.
COPY apps/backend/core/package.json apps/backend/core/pnpm-lock.yaml apps/backend/core/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY apps/backend/core/tsconfig.json apps/backend/core/tsconfig.build.json apps/backend/core/nest-cli.json ./
COPY apps/backend/core/src ./src
RUN pnpm build

# ── runtime: sólo dist + dependencias de producción ──────────────────────
FROM node:24-slim AS runtime

RUN corepack enable && corepack prepare pnpm@11.18.0 --activate

WORKDIR /app
ENV NODE_ENV=production

COPY apps/backend/core/package.json apps/backend/core/pnpm-lock.yaml apps/backend/core/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist

# Las fuentes compartidas del repo. Hoy core NO las lee al arrancar: el
# catálogo REPS y la demanda del 123 ya vienen compilados a TypeScript
# (src/sedes/catalogo.generado.ts, src/scoring/demanda.generada.ts), y el
# único lector de data/ es el CLI de migración, que no corre en este proceso.
# Viajan igual para que el día que la tarea 0.5 vuelva el prompt clínico
# fuente única en data/, este Dockerfile no tenga que cambiar. Son 6 MB.
COPY data ./data

# Render inyecta PORT. El 3001 es el default de main.ts, para que la imagen
# también corra sin PORT (el 3000 es de apps/frontend).
ENV PORT=3001
EXPOSE 3001

CMD ["node", "dist/main"]
