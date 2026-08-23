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

# ⚠️ EL LAYOUT DEL REPO SE ESPEJA A PROPÓSITO, no es decoración.
#    `zonas.controller.ts` calcula la raíz así:
#        RAIZ = join(__dirname, '..','..','..','..','..')
#    o sea cinco niveles arriba de `dist/zonas`, y de ahí lee
#    `data/derivados/zonas_h3.json` y `data/geo/localidades.geojson`.
#
#    Con la app aplanada en /app/dist eso resolvía a `//data/...`, que no
#    existe: GET /zonas respondía `{"zonas":[],"fuente":"no disponible"}` y
#    /zonas/localidades daba 404 — sin ruido en el log, porque el controlador
#    degrada en silencio. Con la app en /app/apps/backend/core, los cinco
#    niveles caen justo en /app y `data/` queda donde el código la busca.
#
#    Corolario: core SÍ lee data/ en tiempo de ejecución (no al arrancar:
#    la primera vez que alguien pide /zonas). Copiarla no es previsión, es
#    requisito.
WORKDIR /app/apps/backend/core
ENV NODE_ENV=production

COPY apps/backend/core/package.json apps/backend/core/pnpm-lock.yaml apps/backend/core/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist

# En /app/data, que es exactamente donde caen los cinco `..` de arriba.
COPY data /app/data

# Render inyecta PORT. El 3001 es el default de main.ts, para que la imagen
# también corra sin PORT (el 3000 es de apps/frontend).
ENV PORT=3001
EXPOSE 3001

CMD ["node", "dist/main"]
