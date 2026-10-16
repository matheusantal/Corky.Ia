# Finanças — app pessoal com Pluggy + Supabase

Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Postgres, Auth, RLS) · Pluggy (Open Finance) · Recharts · PWA.
Somente consulta: **não faz Pix, transferências nem pagamentos**.

> Documentação da Pluggy consultada em 15/10/2026 (docs.pluggy.ai). Endpoints usados: `POST /auth`, `POST /connect_token`,
> `GET /items/{id}`, `PATCH /items/{id}`, `DELETE /items/{id}`, `GET /accounts?itemId=`, `GET /v2/transactions` (cursor `next`), `POST /webhooks`.

## ⚠️ Leia primeiro: Banco Inter pessoal = conector **MeuPluggy**

Segundo a documentação, uso **pessoal** (só você, até 5 conexões, sem fins comerciais) é gratuito e passa pelo **Meu Pluggy**:

1. Crie conta em <https://meu.pluggy.ai> e autorize o **Banco Inter** lá (CPF, app do banco).
2. No [Dashboard da Pluggy](https://dashboard.pluggy.ai), **com a mesma conta**, crie uma *Application* (guarde `CLIENT_ID` e `CLIENT_SECRET` — o secret aparece **uma vez**).
3. Em *Customization → Connectors*, ative **MeuPluggy** (aba *Direct Connectors*, grupo *Personal*).
4. No app, ao clicar em **Conectar minha conta bancária**, escolha **MeuPluggy** (não o Inter direto) e entre com sua conta Meu Pluggy.

Detalhes: itens MeuPluggy refletem o Meu Pluggy (atualizam a cada 24 h) e **não podem ser atualizados manualmente** — o botão *Sincronizar* importa o que a Pluggy já tem; o pedido de nova coleta é recusado e tratado sem erro. Isso é uma limitação da Pluggy, não do app.
Fluxo comercial/direto com o Inter exige contrato com a Pluggy (fora do escopo pessoal).

## 1. Rodar no Windows (PowerShell)

```powershell
# requisitos: Node 20+  (node -v)
cd financas-pluggy
npm install
copy .env.example .env.local     # preencha as variáveis (seções 2 e 3)
npm run dev                      # http://localhost:3000
```

Verificações úteis: `npm run typecheck` · `npm test` (lógica de normalização) · `npm run test:db` (migration + RLS, sem precisar do Supabase).

## 2. Supabase

1. Crie um projeto em <https://supabase.com>.
2. **Banco:** aplique `supabase/migrations/0001_init.sql` — pelo *SQL Editor* (colar e rodar) ou com a CLI (`npx supabase link` → `npx supabase db push`). Antes de alterar um projeto que já tem tabelas, confira *Table Editor* para evitar conflito de nomes (`profiles`, `categories`, `accounts`, `transactions`…).
3. **Chaves** (*Project Settings → API*): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` (**só servidor** — nunca com prefixo `NEXT_PUBLIC_`).
4. **Auth** (*Authentication → URL Configuration*): Site URL = URL do app; adicione `http://localhost:3000` em Redirect URLs. Para uso só seu: crie sua conta e depois **desative "Allow new users to sign up"**.
5. **Teste de isolamento (obrigatório):** rode `supabase/tests/rls.sql` no SQL Editor. Termina em `ROLLBACK` (não grava nada). Se algo vazar, ele aborta com `FALHOU: …`.

## 3. Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `CLIENT_ID`, `CLIENT_SECRET` | Credenciais da Application na Pluggy (servidor) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente Supabase (protegido por RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend: importação e webhooks (ignora RLS — uso restrito) |
| `NEXT_PUBLIC_APP_URL` | URL pública do app |
| `PLUGGY_WEBHOOK_SECRET` | Segredo (≥32 caracteres aleatórios) que a Pluggy envia no cabeçalho `X-Webhook-Secret` |
| `CRON_SECRET` | Protege `/api/cron/sync` (Vercel Cron envia como Bearer) |
| `NEXT_PUBLIC_PLUGGY_INCLUDE_SANDBOX` | `true` mostra conectores Sandbox no widget |

Gerar segredo: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
`.env.local` está no `.gitignore`. **Credenciais que já foram compartilhadas anteriormente devem ser revogadas e recriadas** (novo secret na Pluggy; *Reset* das chaves no Supabase) antes de qualquer uso real.

## 4. Testar primeiro no Sandbox

Com `NEXT_PUBLIC_PLUGGY_INCLUDE_SANDBOX=true`, clique em conectar e escolha o conector **Pluggy Bank** (Sandbox) com as credenciais de teste de <https://docs.pluggy.ai/en/docs/guides/sandbox>. Itens Sandbox ociosos por 30 dias são apagados pela Pluggy.

## 5. Webhooks

A Pluggy **não assina** webhooks; o mecanismo oficial é um cabeçalho customizado cadastrado em `POST /webhooks`. O endpoint exige `X-Webhook-Secret` e, mesmo assim, só usa o evento como *gatilho* — os dados são sempre relidos da API. Eventos repetidos são ignorados (índice único em `eventId`). A resposta é imediata; o trabalho pesado roda em segundo plano.

Depois do deploy (a Pluggy exige HTTPS e rejeita `localhost`; em dev use ngrok/Cloudflare Tunnel):

```powershell
$env:CLIENT_ID="..."; $env:CLIENT_SECRET="..."; $env:PLUGGY_WEBHOOK_SECRET="..."
node scripts/register-webhook.mjs https://SEU-APP.vercel.app/api/webhooks/pluggy
```

Eventos tratados: `item/created`, `item/updated`, `transactions/*` (sincronizam) · `item/error`, `item/waiting_user_input`, `item/waiting_user_action`, `item/login_succeeded` (atualizam o status) · `item/deleted` (marca como desconectada).
A rotina `/api/cron/sync` (1×/dia, `vercel.json`) é a rede de segurança caso um webhook se perca; no plano Hobby da Vercel cron é limitado a 1×/dia.

## 5b. Publicar na Vercel

```powershell
git init; git add .; git commit -m "inicial"     # confira que .env.local NÃO foi incluído
# suba para um repositório privado no GitHub, importe em vercel.com/new
```
Cadastre todas as variáveis em *Settings → Environment Variables*, faça o deploy, ajuste `NEXT_PUBLIC_APP_URL`, registre o webhook (seção 5) e atualize a Site URL no Supabase. No iPhone: Safari → Compartilhar → **Adicionar à Tela de Início**.

## 6. Decisões de projeto (e por quê)

- **Saldo ≠ resultado do mês.** Saldo vem de `accounts.balance` (contas `BANK`); receitas/despesas vêm das transações. Cartão de crédito (`CREDIT`) é mostrado à parte como valor da fatura e **não** entra no saldo.
- **Transferências próprias não são receita/despesa** (`is_transfer`): pagamento de fatura (por descrição) e pares saída/entrada de mesmo valor entre contas suas em até 2 dias (só quando o par é único). Você corrige manualmente na transação; a escolha manual nunca é sobrescrita.
- **Categorias:** mapeamento por palavra-chave a partir da categoria da Pluggy (`src/lib/pluggy/normalize.ts`); sua escolha manual (`category_source = 'user'`) é preservada nas sincronizações.
- **Sinal do valor** vem de `type` (DEBIT/CREDIT), não do sinal bruto (cartões podem vir positivos).
- **Datas:** `transaction_date` guarda a data de calendário informada (sem deslocar por fuso); `occurred_at` guarda o instante bruto. Meses são calculados em America/Sao_Paulo.
- **Dedup:** `unique (account_id, external_transaction_id)` + upsert. Itens que a instituição deixa de informar (ex.: cartão recria ids no fechamento da fatura) são removidos na reconciliação — só se a coleta completou e trouxe dados. Efeito colateral: uma categoria manual numa transação recriada pelo banco pode se perder.
- **Desconectar** revoga o Item na Pluggy e **apaga** a conexão e os dados dela no app (cascata). O app confirma antes.
- **Segurança:** identidade sempre da sessão; `bank_connections/accounts/transactions` são somente-leitura para o cliente (escrita só pelo backend); o cliente só pode alterar `category_id` e `is_transfer` de transações (grant por coluna + gatilho que valida a posse da categoria); `service_role` só em rotas de servidor, com verificação de propriedade.
- **Tabela extra:** `account_balance_snapshots` (um registro por conta/dia) alimenta o gráfico de evolução do saldo — a API não fornece histórico de saldo.
- Sem service worker de propósito: não cacheamos dados financeiros no dispositivo. O app é instalável (manifest + ícones) e abre sempre com dados frescos.

## 7. Checklist de testes

**Já executado durante o desenvolvimento (ambiente isolado):**
- [x] `tsc --noEmit` e `next build` sem erros.
- [x] Unitários (7): sinal/valor, datas sem deslocamento, fatura como transferência, categorias, pareamento de transferências (incl. casos ambíguos e escolha do usuário).
- [x] Cliente Pluggy contra servidor simulado: `connect_token` com `clientUserId`, paginação por cursor completa, retry em 429, cache da API Key e reautenticação após 403.
- [x] Rotas HTTP: sem sessão → redirect/401; webhook sem segredo/segredo errado → 401; payload inválido → 400; cron sem Bearer → 401; manifest ok.
- [x] Migration aplicada em Postgres (PGlite) + `rls.sql` passando, **com controle negativo** (3 sabotagens deliberadas são detectadas).
- [x] Funções do dashboard (resumo, série mensal, por categoria) com transferência excluída corretamente.

**Você precisa executar (dependem das suas contas):**
- [ ] Login/cadastro/logout no seu projeto Supabase real; `supabase/tests/rls.sql` no SQL Editor.
- [ ] Conectar pelo **Sandbox**: widget abre, Item é validado, contas e transações aparecem, recarregar mantém tudo.
- [ ] Sincronizar duas vezes: sem duplicatas; editar categoria, sincronizar de novo: edição preservada.
- [ ] Webhook real (após deploy + `register-webhook.mjs`): evento chega, aparece em `webhook_events`, reentrega não duplica.
- [ ] Segundo usuário de teste: não enxerga nada do primeiro.
- [ ] Layout no iPhone (Adicionar à Tela de Início) e no desktop.
- [ ] Conexão real via **MeuPluggy** com o Inter.

## 8. Pendências externas / limites conhecidos

- Credenciais da Pluggy e do Supabase (você precisa criar; as antigas devem ser trocadas).
- Conta no Meu Pluggy com o Inter autorizado e MeuPluggy ativado na Application.
- HTTPS público para webhooks (deploy ou túnel).
- Nada aqui foi executado contra o **Supabase real nem a Pluggy real** — só contra simulações e Postgres local; o primeiro teste ponta a ponta é seu. Pontos que valem atenção nele: o formato exato dos campos de `type`/`status` e das categorias nas respostas reais (ajuste `normalize.ts` se a Pluggy usar outros valores), e o comportamento do `PATCH /items/{id}` em itens MeuPluggy (tratado como "não atualizável").
- `GET /v2/items` não existe para contas Meu Pluggy; por isso o app registra o `itemId` que o widget devolve.

## Estrutura

```
supabase/migrations/0001_init.sql   tabelas, índices, RLS, funções do dashboard
supabase/tests/rls.sql              teste de isolamento (SQL Editor)
scripts/register-webhook.mjs        cadastra o webhook na Pluggy
scripts/test-db.mjs                 migration + RLS em Postgres local (PGlite)
src/lib/pluggy/{client,sync,normalize}.ts
src/app/api/{connect-token,items,connections,webhooks/pluggy,cron/sync}
src/app/(app)/{page,transactions,accounts,categories}
src/components/…
```
