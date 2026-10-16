import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createConnectToken } from "@/lib/pluggy/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/connect-token
 * Cria um Connect Token (30 min) já associado ao usuário logado via clientUserId.
 * O frontend recebe somente o accessToken — nunca CLIENT_SECRET nem API Key.
 * (Os webhooks são recebidos pelo Webhook cadastrado na aplicação: veja scripts/register-webhook.mjs.)
 */
export async function POST(req: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Reconexão (ex.: autorização expirada): o Item vem de uma conexão que pertence ao usuário (RLS).
  const body = (await req.json().catch(() => null)) as { connectionId?: string } | null;
  let itemId: string | undefined;
  if (body?.connectionId) {
    const { data: conn } = await supabase.from("bank_connections").select("item_id").eq("id", body.connectionId).maybeSingle();
    if (!conn) return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 });
    itemId = conn.item_id;
  }
  try {
    const accessToken = await createConnectToken({ clientUserId: user.id, itemId });
    return NextResponse.json({ accessToken, itemId: itemId ?? null });
  } catch {
    return NextResponse.json({ error: "Não foi possível iniciar a conexão agora. Tente novamente." }, { status: 502 });
  }
}
