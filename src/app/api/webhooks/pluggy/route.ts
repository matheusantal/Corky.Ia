import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeEqual } from "@/lib/security";
import { refreshConnectionStatus, syncConnection } from "@/lib/pluggy/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface PluggyWebhookPayload {
  event?: string;
  eventId?: string;
  itemId?: string;
  clientUserId?: string;
  triggeredBy?: string;
}

const SYNC_EVENTS = new Set(["item/created", "item/updated", "transactions/created", "transactions/updated", "transactions/deleted"]);
const STATUS_EVENTS = new Set(["item/error", "item/waiting_user_input", "item/waiting_user_action", "item/login_succeeded"]);

/**
 * POST /api/webhooks/pluggy
 * A Pluggy NÃO assina webhooks. O mecanismo oficial é o cabeçalho customizado configurado em
 * POST /webhooks ("headers"): aqui exigimos X-Webhook-Secret (veja scripts/register-webhook.mjs).
 * Defesa extra: o evento só dispara uma re-sincronização que lê a verdade direto da API da Pluggy;
 * o corpo do webhook nunca é gravado como dado financeiro.
 * Responde 200 rapidamente (limite de 10 s) e processa em segundo plano.
 */
export async function POST(req: Request) {
  const secret = process.env.PLUGGY_WEBHOOK_SECRET;
  if (!secret || !safeEqual(req.headers.get("x-webhook-secret"), secret)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const payload = (await req.json().catch(() => null)) as PluggyWebhookPayload | null;
  if (!payload?.event) return NextResponse.json({ error: "Payload inválido" }, { status: 400 });

  const admin = createAdminClient();
  const eventType = String(payload.event).slice(0, 80);
  const providerEventId = payload.eventId ? String(payload.eventId).slice(0, 80) : null;

  let connection: { id: string; user_id: string } | null = null;
  if (payload.itemId) {
    const { data } = await admin
      .from("bank_connections").select("id,user_id").eq("provider", "pluggy").eq("item_id", String(payload.itemId)).maybeSingle();
    connection = data;
  }

  // Idempotência: índice único em provider_event_id. Reentrega do mesmo evento => 23505 => ignora.
  const { data: ev, error } = await admin
    .from("webhook_events")
    .insert({
      provider_event_id: providerEventId,
      event_type: eventType,
      connection_id: connection?.id ?? null,
      user_id: connection?.user_id ?? null,
      status: "received",
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
    return NextResponse.json({ error: "Falha ao registrar evento" }, { status: 500 });
  }

  const handleEvent = async () => {
    let status: "processed" | "ignored" | "failed" = "processed";
    try {
      if (!connection) {
        status = "ignored"; // item desconhecido (ex.: ainda não registrado pelo /api/items)
      } else if (eventType === "item/deleted") {
        await admin.from("bank_connections").update({ status: "disconnected", status_message: "Conexão removida" }).eq("id", connection.id);
      } else if (SYNC_EVENTS.has(eventType)) {
        const r = await syncConnection(admin, connection.id, "webhook");
        if (r.status === "failed") status = "failed";
      } else if (STATUS_EVENTS.has(eventType)) {
        await refreshConnectionStatus(admin, connection.id);
      } else {
        status = "ignored";
      }
    } catch {
      status = "failed";
    }
    await admin.from("webhook_events").update({ status, processed_at: new Date().toISOString() }).eq("id", ev.id);
  };
  waitUntil(handleEvent());

  return NextResponse.json({ ok: true });
}
