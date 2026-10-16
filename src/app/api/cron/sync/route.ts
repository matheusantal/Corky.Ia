import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeEqual } from "@/lib/security";
import { syncConnection } from "@/lib/pluggy/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/sync — rede de segurança caso algum webhook se perca.
 * Vercel Cron envia "Authorization: Bearer $CRON_SECRET".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || !safeEqual(auth, secret)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const admin = createAdminClient();
  const { data: conns } = await admin
    .from("bank_connections").select("id").neq("status", "disconnected")
    .order("last_synced_at", { ascending: true, nullsFirst: true }).limit(20);

  const started = Date.now();
  const results: Record<string, string> = {};
  for (const c of conns ?? []) {
    if (Date.now() - started > 45_000) break; // respeita o limite de duração da função
    results[c.id] = (await syncConnection(admin, c.id, "cron")).status;
  }
  return NextResponse.json({ processed: Object.keys(results).length, results });
}
