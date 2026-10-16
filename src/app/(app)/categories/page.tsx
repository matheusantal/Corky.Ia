import { createClient } from "@/lib/supabase/server";
import CategoriesManager from "@/components/CategoriesManager";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data } = await supabase.from("categories").select("id,name,type,user_id").order("name");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Categorias</h1>
      <CategoriesManager categories={data ?? []} userId={user!.id} />
    </div>
  );
}
