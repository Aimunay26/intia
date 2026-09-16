import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const nextConfig: NextConfig = {
  // Desarrollo y produccion escriben en carpetas distintas. Si comparten `.next`,
  // arrancar `npm run dev` despues de un `npm run build` deja artefactos mezclados
  // y las paginas empiezan a dar error 500 sin motivo aparente.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",

  webpack(config) {
    // Webpack trata node_modules como inmutable: invalidar su caché cuando
    // cambie el backport evita servir el runtime anterior tras recompilar.
    if (config.cache && typeof config.cache === "object") {
      const revision = createHash("sha256").update(readFileSync("scripts/patch-next-react.mjs")).digest("hex");
      config.cache.version = `${config.cache.version ?? ""}:react-backport:${revision}`;
    }
    return config;
  },

  experimental: {
    serverActions: {
      // Los PDFs de referencia se suben por Server Action
      // Alineado con el tope real de Vercel (4,5 MB) y con MAX_UPLOAD_BYTES.
      bodySizeLimit: "4.5mb",
    },
  },
  serverExternalPackages: ["@prisma/client", "bcryptjs", "unpdf"],
};

export default withWorkflow(nextConfig);
