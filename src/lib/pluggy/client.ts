import "server-only";
import { requireEnv } from "@/lib/env";
import type {
  PluggyAccount,
  PluggyAccountsResponse,
  PluggyCursorPage,
  PluggyItem,
  PluggyTransaction,
} from "./types";

const BASE_URL = process.env.PLUGGY_API_URL ?? "https://api.pluggy.ai";
// A API Key vale 2 horas (docs: /auth). Renovamos com folga.
const API_KEY_TTL_MS = 100 * 60 * 1000;

let cached: { key: string; expiresAt: number } | null = null;

export class PluggyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "PluggyError";
  }
}

async function authenticate(): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: requireEnv("CLIENT_ID"), clientSecret: requireEnv("CLIENT_SECRET") }),
    cache: "no-store",
  });
  if (!res.ok) throw new PluggyError(res.status, `Falha na autenticação com a Pluggy (HTTP ${res.status})`);
  const { apiKey } = (await res.json()) as { apiKey: string };
  cached = { key: apiKey, expiresAt: Date.now() + API_KEY_TTL_MS };
  return apiKey;
}

async function getApiKey(force = false): Promise<string> {
  if (!force && cached && cached.expiresAt > Date.now()) return cached.key;
  return authenticate();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Requisição autenticada com X-API-KEY, re-autenticação em 401/403 e retry em 429/5xx. */
async function request<T>(path: string, init: RequestInit = {}, attempt = 0, reauthed = false): Promise<T> {
  const apiKey = await getApiKey();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey, ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });

  if ((res.status === 401 || res.status === 403) && !reauthed) {
    await getApiKey(true);
    return request<T>(path, init, attempt, true);
  }
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : 800 * 2 ** attempt);
    return request<T>(path, init, attempt + 1, reauthed);
  }
  if (!res.ok) {
    // Não inclui o corpo cru na mensagem: pode conter dados sensíveis.
    throw new PluggyError(res.status, `Pluggy respondeu HTTP ${res.status} em ${path.split("?")[0]}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** POST /connect_token — o token vale 30 min e só enxerga os itens criados com ele. */
export async function createConnectToken(opts: { clientUserId: string; webhookUrl?: string; itemId?: string }) {
  const body: Record<string, unknown> = {
    options: {
      clientUserId: opts.clientUserId,
      ...(opts.webhookUrl ? { webhookUrl: opts.webhookUrl } : {}),
    },
  };
  // Para reconectar/atualizar um Item existente (docs: recipe "update an item")
  if (opts.itemId) body.itemId = opts.itemId;
  const { accessToken } = await request<{ accessToken: string }>("/connect_token", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return accessToken;
}

export const getItem = (itemId: string) => request<PluggyItem>(`/items/${encodeURIComponent(itemId)}`);

/** PATCH /items/{id} com {} dispara nova sincronização usando as credenciais guardadas. */
export const triggerItemUpdate = (itemId: string) =>
  request<PluggyItem>(`/items/${encodeURIComponent(itemId)}`, { method: "PATCH", body: "{}" });

export const deleteItem = (itemId: string) =>
  request<void>(`/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });

export async function listAccounts(itemId: string): Promise<PluggyAccount[]> {
  const res = await request<PluggyAccountsResponse>(`/accounts?itemId=${encodeURIComponent(itemId)}`);
  return res.results;
}

/** GET /v2/transactions seguindo o cursor `next` até acabar (500 por página). */
export async function listAllTransactions(accountId: string, dateFrom?: string): Promise<PluggyTransaction[]> {
  const all: PluggyTransaction[] = [];
  let query = `?accountId=${encodeURIComponent(accountId)}${dateFrom ? `&dateFrom=${encodeURIComponent(dateFrom)}` : ""}`;
  for (let page = 0; page < 200; page++) {
    const res = await request<PluggyCursorPage<PluggyTransaction>>(`/v2/transactions${query}`);
    all.push(...res.results);
    if (!res.next) return all;
    query = res.next; // já vem pronto: "?accountId=...&after=..."
  }
  throw new PluggyError(500, "Paginação excedeu o limite de segurança de páginas");
}
