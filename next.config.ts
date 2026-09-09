import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  // Desarrollo y produccion escriben en carpetas distintas. Si comparten `.next`,
  // arrancar `npm run dev` despues de un `npm run build` deja artefactos mezclados
  // y las paginas empiezan a dar error 500 sin motivo aparente.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",

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
