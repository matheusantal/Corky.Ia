/** Lê variável de ambiente obrigatória (somente servidor) e falha com mensagem clara. */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}
