import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Chat Insights</h1>
      <p className="text-lg text-neutral-600">
        Conecta tu WhatsApp Business y descubre qué preguntan tus clientes, cuánto tardas en
        responder y qué ventas se te están escapando.
      </p>
      <div className="flex gap-3">
        <Link href="/login" className="rounded-lg bg-neutral-900 px-5 py-2.5 font-medium text-white">
          Entrar
        </Link>
        <Link href="/login?mode=signup" className="rounded-lg border border-neutral-300 px-5 py-2.5 font-medium">
          Crear cuenta
        </Link>
      </div>
      <footer className="mt-12 text-sm text-neutral-500">
        <Link href="/privacidad" className="underline">Privacidad</Link> ·{" "}
        <Link href="/terminos" className="underline">Términos</Link> ·{" "}
        <Link href="/eliminar-datos" className="underline">Eliminar datos</Link>
      </footer>
    </main>
  );
}
