import type { PluggyTransaction } from "./types";

export const DEFAULT_CATEGORY = {
  food: "Alimentação",
  transport: "Transporte",
  housing: "Moradia",
  shopping: "Compras",
  leisure: "Lazer",
  health: "Saúde",
  education: "Educação",
  subscriptions: "Assinaturas",
  transfers: "Transferências",
  income: "Salário e outras receitas",
  other: "Outros",
} as const;

// A Pluggy devolve categorias em texto (ex.: "Groceries", "Transfers"). Mapeamento por palavra-chave,
// em minúsculas. A primeira regra que casar vence. Ajuste livremente.
const RULES: Array<[RegExp, string]> = [
  [/transfer|pix|ted|doc\b/, DEFAULT_CATEGORY.transfers],
  [/subscription|streaming|assinatura|digital services/, DEFAULT_CATEGORY.subscriptions],
  [/grocer|supermarket|restaurant|food|eating|bakery|snack|delivery|mercado|aliment/, DEFAULT_CATEGORY.food],
  [/transport|taxi|ride|uber|fuel|gas station|parking|toll|public transit|vehicle|combust/, DEFAULT_CATEGORY.transport],
  [/rent|housing|utilit|electric|water|internet|telecom|home|condom|moradia|aluguel/, DEFAULT_CATEGORY.housing],
  [/health|pharmacy|drugstore|medical|dental|gym|fitness|saúde|farm/, DEFAULT_CATEGORY.health],
  [/education|school|tuition|course|book|educa/, DEFAULT_CATEGORY.education],
  [/entertainment|leisure|travel|hotel|cinema|games|lazer|bar\b/, DEFAULT_CATEGORY.leisure],
  [/shopping|clothing|electronics|online shop|retail|compras/, DEFAULT_CATEGORY.shopping],
];
const INCOME_RE = /income|salary|payroll|wage|dividend|interest|refund|sal[aá]rio|renda/;

export function mapCategoryName(pluggyCategory: string | null | undefined, type: "income" | "expense"): string {
  const c = (pluggyCategory ?? "").toLowerCase();
  if (type === "income") return DEFAULT_CATEGORY.income;
  if (INCOME_RE.test(c)) return DEFAULT_CATEGORY.other;
  for (const [re, name] of RULES) if (re.test(c)) return name;
  return DEFAULT_CATEGORY.other;
}

export interface NormalizedTransaction {
  external_transaction_id: string;
  provider_id: string | null;
  description: string;
  amount: number;
  type: "income" | "expense";
  pluggy_category: string | null;
  is_transfer: boolean;
  transaction_date: string; // YYYY-MM-DD
  occurred_at: string;
  status: string;
  currency_code: string;
}

// Pagamento de fatura de cartão: sai da conta e entra no cartão — não é despesa nem receita.
const CARD_PAYMENT_RE = /(pagamento|pgto|pag)\.?\s*(de\s*)?(da\s*)?fatura|fatura\s*(cart[aã]o|paga)|credit card payment|pagamento recebido/i;

/**
 * O sinal vem de `type` (DEBIT/CREDIT), não do sinal bruto do `amount`:
 * em cartões a instituição pode devolver compras como valores positivos.
 */
export function normalizeTransaction(t: PluggyTransaction): NormalizedTransaction {
  const abs = Math.abs(Number(t.amount));
  const type: "income" | "expense" = t.type === "CREDIT" ? "income" : "expense";
  const description = (t.description || t.descriptionRaw || "Sem descrição").trim().slice(0, 300);
  const occurred = new Date(t.date);
  return {
    external_transaction_id: t.id,
    provider_id: t.providerId ?? null,
    description,
    amount: Math.round((type === "income" ? abs : -abs) * 100) / 100,
    type,
    pluggy_category: t.category ?? null,
    is_transfer: CARD_PAYMENT_RE.test(description) || CARD_PAYMENT_RE.test(t.descriptionRaw ?? ""),
    // A Pluggy envia datas como meia-noite UTC: usamos a data de calendário informada, sem deslocar por fuso.
    transaction_date: t.date.slice(0, 10),
    occurred_at: Number.isNaN(occurred.getTime()) ? new Date().toISOString() : occurred.toISOString(),
    status: t.status ?? "POSTED",
    currency_code: t.currencyCode ?? "BRL",
  };
}

// ---------- detecção de transferências entre contas próprias ----------
export interface TransferCandidate {
  id: string;
  account_id: string;
  amount: number; // com sinal
  transaction_date: string;
  is_transfer: boolean;
  transfer_source: "auto" | "user";
}

const DAY = 86_400_000;
const dayNum = (d: string) => Math.floor(Date.parse(d + "T00:00:00Z") / DAY);

/**
 * Pareia saída e entrada de mesmo valor, em contas DIFERENTES, com até 2 dias de diferença.
 * Retorna os ids a marcar como transferência. Só pareia quando o par é único (evita falsos positivos);
 * nunca toca em transações cuja marcação foi definida manualmente pelo usuário.
 */
export function detectOwnTransfers(txs: TransferCandidate[]): string[] {
  const pool = txs.filter((t) => !t.is_transfer && t.transfer_source !== "user" && t.amount !== 0);
  const outs = pool.filter((t) => t.amount < 0);
  const ins = pool.filter((t) => t.amount > 0);
  const marked = new Set<string>();
  const usedIn = new Set<string>();

  for (const o of outs) {
    const matches = ins.filter(
      (i) =>
        !usedIn.has(i.id) &&
        i.account_id !== o.account_id &&
        Math.abs(i.amount + o.amount) < 0.005 &&
        Math.abs(dayNum(i.transaction_date) - dayNum(o.transaction_date)) <= 2,
    );
    if (matches.length === 1) {
      const rivals = outs.filter(
        (o2) => o2.id !== o.id && o2.account_id !== matches[0].account_id &&
          Math.abs(o2.amount - o.amount) < 0.005 &&
          Math.abs(dayNum(o2.transaction_date) - dayNum(matches[0].transaction_date)) <= 2,
      );
      if (rivals.length === 0) {
        marked.add(o.id);
        marked.add(matches[0].id);
        usedIn.add(matches[0].id);
      }
    }
  }
  return [...marked];
}
