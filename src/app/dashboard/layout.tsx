import Link from "next/link";
import { logout } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: isAdmin } = await supabase.rpc("is_admin");

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link href="/dashboard" className="font-semibold">
            Chat Insights
          </Link>
          <div className="flex items-center gap-4 text-sm text-neutral-600">
            {isAdmin && (
              <Link href="/dashboard/admin" className="font-medium text-neutral-900 underline">
                Administración
              </Link>
            )}
            <span>{user?.email}</span>
            <form action={logout}>
              <button className="underline">Salir</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
