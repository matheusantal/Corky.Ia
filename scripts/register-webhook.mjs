// Registra (uma única vez) o webhook da aplicação na Pluggy, com o segredo no cabeçalho X-Webhook-Secret.
// Uso (PowerShell):
//   $env:CLIENT_ID="..."; $env:CLIENT_SECRET="..."; $env:PLUGGY_WEBHOOK_SECRET="..."
//   node scripts/register-webhook.mjs https://SEU-APP.vercel.app/api/webhooks/pluggy
// Obs.: a Pluggy exige HTTPS e não aceita localhost (use ngrok/Cloudflare Tunnel em desenvolvimento).
const [url] = process.argv.slice(2);
const { CLIENT_ID, CLIENT_SECRET, PLUGGY_WEBHOOK_SECRET } = process.env;
if (!url || !CLIENT_ID || !CLIENT_SECRET || !PLUGGY_WEBHOOK_SECRET) {
  console.error("Faltam: URL (argumento), CLIENT_ID, CLIENT_SECRET e PLUGGY_WEBHOOK_SECRET.");
  process.exit(1);
}
const api = "https://api.pluggy.ai";
const json = { "Content-Type": "application/json" };

const auth = await fetch(`${api}/auth`, { method: "POST", headers: json, body: JSON.stringify({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }) });
if (!auth.ok) { console.error("Falha em /auth:", auth.status); process.exit(1); }
const { apiKey } = await auth.json();
const h = { ...json, "X-API-KEY": apiKey };

const list = await fetch(`${api}/webhooks`, { headers: h });
if (list.ok) {
  const body = await list.json();
  const found = (body.results ?? body).find?.((w) => w.url === url);
  if (found) { console.log("Já existe um webhook para essa URL:", found.id, "(evento:", found.event + ")"); process.exit(0); }
}
const res = await fetch(`${api}/webhooks`, {
  method: "POST", headers: h,
  body: JSON.stringify({ url, event: "all", headers: { "X-Webhook-Secret": PLUGGY_WEBHOOK_SECRET } }),
});
console.log(res.ok ? "Webhook registrado." : `Falha ao registrar (${res.status}): ${await res.text()}`);
