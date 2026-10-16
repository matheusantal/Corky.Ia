import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteItem, PluggyError } from "@/lib/pluggy/client";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/connections/:id
 * Revoga o consentimento (DELETE /items/{id} na Pluggy) e apaga a conexão e seus dados locais (cascata).
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data: conn } = await supabase.from("bank_connections").select("id,item_id").eq("id", params.id).maybeSingle();
  if (!conn) return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 });

  try {
    await deleteItem(conn.item_id);
  } catch (e) {
    if (!(e instanceof PluggyError && e.status === 404)) {
      return NextResponse.json({ error: "Não foi possível revogar a conexão na Pluggy. Nada foi apagado." }, { status: 502 });
    }
  }
  const admin = createAdminClient();
  const { error } = await admin.from("bank_connections").delete().eq("id", conn.id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Falha ao remover dados locais" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
