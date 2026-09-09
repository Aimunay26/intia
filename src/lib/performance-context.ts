import { cache } from "react";
import { randomUUID } from "node:crypto";

// React limita esta identidad al render de la petición, incluidos bloques de Suspense.
export const renderRequestId = cache(() => randomUUID());
