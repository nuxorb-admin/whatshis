import Link from "next/link";
import { login, signup } from "./actions";

const input = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 outline-none focus:border-neutral-900";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const isSignup = params.mode === "signup";

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">{isSignup ? "Crear cuenta" : "Entrar"}</h1>

      {params.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{params.error}</p>}
      {params.info && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{params.info}</p>}

      <form action={isSignup ? signup : login} className="space-y-3">
        {isSignup && (
          <input name="business_name" placeholder="Nombre del negocio" className={input} required />
        )}
        <input name="email" type="email" placeholder="Correo" className={input} required />
        <input
          name="password"
          type="password"
          placeholder="Contraseña"
          minLength={8}
          className={input}
          required
        />
        <button className="w-full rounded-lg bg-neutral-900 py-2.5 font-medium text-white">
          {isSignup ? "Crear cuenta" : "Entrar"}
        </button>
      </form>

      <p className="text-sm text-neutral-600">
        {isSignup ? (
          <>¿Ya tienes cuenta? <Link href="/login" className="underline">Entra</Link></>
        ) : (
          <>¿Nuevo? <Link href="/login?mode=signup" className="underline">Crea una cuenta</Link></>
        )}
      </p>
    </main>
  );
}
