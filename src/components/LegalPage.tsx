import Link from "next/link";
import { site } from "@/lib/site";

export default function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <Link href="/" className="text-sm text-neutral-500 underline">
        ← {site.name}
      </Link>
      <h1 className="mt-4 text-3xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-neutral-500">Última actualización / Last updated: {site.updatedAt}</p>
      <div className="mt-8 space-y-4 leading-relaxed text-neutral-800 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
      <footer className="mt-12 border-t border-neutral-200 pt-6 text-sm text-neutral-500">
        <Link href="/privacidad" className="underline">Privacidad</Link> ·{" "}
        <Link href="/terminos" className="underline">Términos</Link> ·{" "}
        <Link href="/eliminar-datos" className="underline">Eliminar datos</Link>
      </footer>
    </main>
  );
}

export function Contact() {
  return site.contactEmail ? (
    <a href={`mailto:${site.contactEmail}`} className="underline">
      {site.contactEmail}
    </a>
  ) : (
    <span>el correo de contacto indicado en la plataforma</span>
  );
}
