import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Identidade vem SEMPRE da sessão validada (getUser consulta o Auth), nunca do corpo da requisição. */
export async function getSessionUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}
