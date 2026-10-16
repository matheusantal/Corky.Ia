import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getItem, PluggyError } from "@/lib/pluggy/client";
import { syncConnection } from "@/lib/pluggy/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/items  { itemId }
 * Chamado após o onSuccess do widget. Não confia no widget: consulta o Item real na Pluggy,
 * confere que ele pertence a este usuário (clientUserId do Connect Token) e só então registra.
 */
export async function POST(req: Request) {
  const { user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { itemId?: string } | null;
  const itemId = body?.itemId;
  if (!itemId || !UUID_RE.test(itemId)) return NextResponse.json({ error: "itemId inválido" }, { status: 400 });

  let item;
  try {
    item = await getItem(itemId);
  } catch (e) {
    const notFound = e instanceof PluggyError && e.status === 404;
    return NextResponse.json({ error: notFound ? "Conexão não encontrada na Pluggy" : "Falha ao validar a conexão" }, { status: notFound ? 404 : 502 });
  }
  if (item.clientUserId !== user.id) {
    return NextResponse.json({ error: "Esta conexão não pertence ao seu usuário" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.from("bank_connections").select("id,user_id").eq("provider", "pluggy").eq("item_id", itemId).maybeSingle();
  if (existing && existing.user_id !== user.id) {
    return NextResponse.json({ error: "Conexão já registrada" }, { status: 409 });
  }

  let connectionId = existing?.id as string | undefined;
  if (!connectionId) {
    const { data, error } = await admin
      .from("bank_connections")
      .insert({
        user_id: user.id,
        provider: "pluggy",
        item_id: itemId,
        status: "pending",
        institution_name: item.connector?.name ?? null,
        connector_id: item.connector?.id ?? null,
        provider_status: item.status,
        execution_status: item.executionStatus,
      })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: "Não foi possível registrar a conexão" }, { status: 500 });
    connectionId = data.id;
  }

  // Sincronização inicial (se o Item ainda estiver atualizando, o webhook item/updated conclui a importação).
  const result = await syncConnection(admin, connectionId!, "connect");
  return NextResponse.json({ connectionId, itemStatus: item.status, sync: result });
}
