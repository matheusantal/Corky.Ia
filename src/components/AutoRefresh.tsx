"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Enquanto houver conexão importando, recarrega os dados do servidor a cada poucos segundos. */
export default function AutoRefresh({ active, everyMs = 6000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, router]);
  return null;
}
