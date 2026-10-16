import Link from "next/link";
import { LayoutDashboard, ListOrdered, Landmark, Tags, LogOut } from "lucide-react";

const links = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/transactions", label: "Transações", icon: ListOrdered },
  { href: "/accounts", label: "Contas", icon: Landmark },
  { href: "/categories", label: "Categorias", icon: Tags },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))] md:pb-10">
      <header className="mb-6 hidden items-center justify-between md:flex">
        <span className="text-lg font-semibold">Finanças</span>
        <nav className="flex items-center gap-1">
          {links.map(({ href, label }) => (
            <Link key={href} href={href} className="rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-white/5 hover:text-ink">{label}</Link>
          ))}
          <form action="/auth/signout" method="post">
            <button className="rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-white/5 hover:text-ink">Sair</button>
          </form>
        </nav>
      </header>
      <main className="fade-in">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {links.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="flex flex-col items-center gap-1 py-2.5 text-[11px] text-ink-muted active:text-brand-light">
                <Icon size={20} aria-hidden />{label}
              </Link>
            </li>
          ))}
          <li>
            <form action="/auth/signout" method="post">
              <button className="flex w-full flex-col items-center gap-1 py-2.5 text-[11px] text-ink-muted"><LogOut size={20} aria-hidden />Sair</button>
            </form>
          </li>
        </ul>
      </nav>
    </div>
  );
}
