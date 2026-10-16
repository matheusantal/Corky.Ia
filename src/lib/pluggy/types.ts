// Tipos mínimos, baseados nas respostas documentadas em docs.pluggy.ai (consultado em 15/10/2026).

export type PluggyItemStatus = "UPDATING" | "LOGIN_ERROR" | "OUTDATED" | "WAITING_USER_INPUT" | "UPDATED";

export interface PluggyItem {
  id: string;
  status: PluggyItemStatus;
  executionStatus: string;
  lastUpdatedAt?: string | null;
  clientUserId?: string | null;
  connector: { id: number; name: string; isSandbox?: boolean; isOpenFinance?: boolean };
  error?: { code: string; message: string } | null;
}

export interface PluggyAccount {
  id: string;
  type: "BANK" | "CREDIT" | string;
  subtype?: string | null;
  number?: string | null;
  name: string;
  balance: number;
  currencyCode?: string | null;
}

export interface PluggyTransaction {
  id: string;
  description: string;
  descriptionRaw?: string | null;
  currencyCode?: string | null;
  amount: number;
  date: string; // ISO
  category?: string | null;
  status?: string | null; // POSTED | PENDING
  type: "DEBIT" | "CREDIT" | string;
  providerId?: string | null;
  accountId: string;
}

export interface PluggyAccountsResponse {
  results: PluggyAccount[];
}

export interface PluggyCursorPage<T> {
  results: T[];
  next: string | null;
}
