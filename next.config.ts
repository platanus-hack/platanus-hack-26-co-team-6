import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Con 4 personas editando en paralelo, un error de tipos en el carril de
  // alguien no puede bloquear el deploy de los otros tres. Por eso el build
  // no falla por tipos.
  //
  // ⚠️ EL PRECIO: un error real se esconde. La red de seguridad es
  //    `npm run typecheck`, que HOY PASA LIMPIO. Corranlo antes de cada
  //    push, y obligatoriamente en el feature freeze de H20.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
