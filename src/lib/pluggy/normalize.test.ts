import test from "node:test";
import assert from "node:assert/strict";
import { detectOwnTransfers, mapCategoryName, normalizeTransaction } from "./normalize.ts";

const base = { id: "x", description: "Mercado", amount: 50, date: "2026-10-14T00:00:00.000Z", type: "DEBIT", accountId: "a" };

test("débito vira despesa negativa mesmo com amount positivo", () => {
  const n = normalizeTransaction(base);
  assert.equal(n.type, "expense");
  assert.equal(n.amount, -50);
});

test("crédito vira receita positiva", () => {
  const n = normalizeTransaction({ ...base, type: "CREDIT", amount: -80 });
  assert.equal(n.type, "income");
  assert.equal(n.amount, 80);
});

test("data de calendário não desloca por fuso", () => {
  assert.equal(normalizeTransaction(base).transaction_date, "2026-10-14");
});

test("pagamento de fatura é marcado como transferência", () => {
  assert.equal(normalizeTransaction({ ...base, description: "PAGAMENTO DE FATURA CARTAO" }).is_transfer, true);
  assert.equal(normalizeTransaction(base).is_transfer, false);
});

test("categorias", () => {
  assert.equal(mapCategoryName("Groceries", "expense"), "Alimentação");
  assert.equal(mapCategoryName("Transfers", "expense"), "Transferências");
  assert.equal(mapCategoryName("Qualquer coisa", "expense"), "Outros");
  assert.equal(mapCategoryName("Salary", "income"), "Salário e outras receitas");
});

test("pareia transferência entre contas próprias", () => {
  const ids = detectOwnTransfers([
    { id: "1", account_id: "A", amount: -300, transaction_date: "2026-10-10", is_transfer: false, transfer_source: "auto" },
    { id: "2", account_id: "B", amount: 300, transaction_date: "2026-10-11", is_transfer: false, transfer_source: "auto" },
    { id: "3", account_id: "A", amount: -12.5, transaction_date: "2026-10-10", is_transfer: false, transfer_source: "auto" },
  ]);
  assert.deepEqual(ids.sort(), ["1", "2"]);
});

test("não pareia na mesma conta nem com ambiguidade nem se o usuário decidiu", () => {
  assert.deepEqual(detectOwnTransfers([
    { id: "1", account_id: "A", amount: -50, transaction_date: "2026-10-10", is_transfer: false, transfer_source: "auto" },
    { id: "2", account_id: "A", amount: 50, transaction_date: "2026-10-10", is_transfer: false, transfer_source: "auto" },
  ]), []);
  assert.deepEqual(detectOwnTransfers([
    { id: "1", account_id: "A", amount: -50, transaction_date: "2026-10-10", is_transfer: false, transfer_source: "auto" },
    { id: "2", account_id: "B", amount: 50, transaction_date: "2026-10-10", is_transfer: false, transfer_source: "auto" },
    { id: "3", account_id: "C", amount: 50, transaction_date: "2026-10-10", is_transfer: false, transfer_source: "auto" },
  ]), []);
  assert.deepEqual(detectOwnTransfers([
    { id: "1", account_id: "A", amount: -50, transaction_date: "2026-10-10", is_transfer: false, transfer_source: "user" },
    { id: "2", account_id: "B", amount: 50, transaction_date: "2026-10-10", is_transfer: false, transfer_source: "auto" },
  ]), []);
});
