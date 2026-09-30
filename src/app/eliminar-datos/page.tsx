import type { Metadata } from "next";
import LegalPage, { Contact } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: `Eliminación de datos · ${site.name}` };

export default function DataDeletionPage() {
  return (
    <LegalPage title="Eliminación de datos / Data Deletion">
      <p>Puedes solicitar que eliminemos todos los datos de tu negocio en cualquier momento.</p>

      <h2>Cómo solicitarlo</h2>
      <ul>
        <li>
          Escríbenos a <Contact /> desde el correo con el que te registraste, con el asunto
          &quot;Eliminar datos&quot; e indicando el número de WhatsApp conectado.
        </li>
        <li>
          Eliminaremos tu cuenta, el token de acceso de Meta, los mensajes, contactos y análisis en
          un plazo máximo de 30 días, y te confirmaremos por correo.
        </li>
        <li>
          También puedes quitar el acceso de {site.name} a tu cuenta desde la configuración de tu
          portafolio de negocio en Meta (Configuración del negocio → Integraciones / Apps).
        </li>
      </ul>

      <hr className="my-10 border-neutral-200" />

      <h2>English</h2>
      <p>
        To delete all of your data, email <Contact /> from your registered address with the subject
        &quot;Delete data&quot; and the connected WhatsApp number. We will delete your account, Meta
        access token, messages, contacts and analytics within 30 days and confirm by email. You can
        also remove {site.name}&apos;s access from your Meta Business settings at any time.
      </p>
    </LegalPage>
  );
}
