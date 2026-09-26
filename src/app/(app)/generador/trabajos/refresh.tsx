"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Deja de consultar cuando no quedan trabajos activos en la página visible. */
export function PendingGenerationRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!active || pending) return;
    const refresh = () => { if (!document.hidden) startTransition(() => router.refresh()); };
    const timer = setInterval(refresh, 8000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [active, pending, router]);
  return null;
}
