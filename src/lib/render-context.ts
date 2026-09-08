import { cache } from "react";

import { requireUser } from "@/lib/auth";
import { getBrandContext } from "@/lib/brand-context";
import { measurePhase } from "@/lib/performance";

// Solo para Server Components: comparte lecturas dentro de una petición.
// Acciones y rutas API siguen usando los helpers originales, con lecturas frescas.
export const requirePageUser = cache(() => measurePhase("session", requireUser));
export const getPageBrandContext = cache(() => measurePhase("brand-context", getBrandContext));
