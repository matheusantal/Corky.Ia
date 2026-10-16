import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestProviderRefresh, syncConnection } from "@/lib/pluggy/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/connections/:id/sync — importa o que a Pluggy já tem e pede nova coleta ao banco. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Propriedade verificada via RLS: se a linha não é do usuário, o select volta vazio.
  const { data: conn } = await supabase.from("bank_connections").select("id,item_id").eq("id", params.id).maybeSingle();
  if (!conn) return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 });

  const admin = createAdminClient();
  const result = await syncConnection(admin, conn.id, "manual");
  let refreshRequested = false;
  try {
    refreshRequested = await requestProviderRefresh(conn.item_id);
  } catch {
    /* a importação local já foi feita; a coleta no banco é "melhor esforço" */
  }
  return NextResponse.json({ sync: result, refreshRequested });
}
