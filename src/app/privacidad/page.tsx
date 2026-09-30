import type { Metadata } from "next";
import LegalPage, { Contact } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: `Política de privacidad · ${site.name}` };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidad / Privacy Policy">
      <p>
        {site.name} ({site.url}) es operado por {site.company}. Esta política explica qué datos
        tratamos cuando un negocio conecta su cuenta de WhatsApp Business a la plataforma.
      </p>

      <h2>1. Datos que recopilamos</h2>
      <ul>
        <li>Datos de la cuenta del usuario: nombre del negocio, correo electrónico y contraseña (cifrada).</li>
        <li>
          Datos de WhatsApp Business que el negocio autoriza mediante el registro integrado de Meta:
          identificadores de la cuenta (WABA), número de teléfono del negocio y nombre verificado.
        </li>
        <li>
          Mensajes enviados y recibidos por el negocio, incluyendo el historial de hasta 180 días que
          el negocio decide compartir, y los contactos de su app de WhatsApp Business.
        </li>
        <li>Un token de acceso emitido por Meta, guardado solo en nuestros servidores.</li>
      </ul>

      <h2>2. Para qué usamos los datos</h2>
      <ul>
        <li>Mostrar al negocio sus propias conversaciones en un panel privado.</li>
        <li>
          Generar análisis para el negocio: temas frecuentes, tiempos de respuesta, oportunidades de
          venta y sentimiento de sus clientes.
        </li>
        <li>Enviar mensajes y gestionar plantillas de WhatsApp cuando el negocio lo solicita desde el panel.</li>
      </ul>
      <p>
        No vendemos los datos, no los usamos para publicidad y no los compartimos con otros clientes
        de la plataforma. Cada negocio solo puede ver su propia información.
      </p>

      <h2>3. Proveedores que procesan datos</h2>
      <ul>
        <li>Meta Platforms (WhatsApp Business Platform): origen de los mensajes.</li>
        <li>Supabase: base de datos y autenticación.</li>
        <li>Vercel: alojamiento de la aplicación.</li>
        <li>Proveedores de inteligencia artificial, únicamente para generar los análisis solicitados por el negocio.</li>
      </ul>

      <h2>4. Conservación y eliminación</h2>
      <p>
        Conservamos los datos mientras la cuenta esté activa. El negocio puede desconectar su número
        y solicitar la eliminación de todos sus datos en cualquier momento; los eliminamos en un
        plazo máximo de 30 días. Consulta <a href="/eliminar-datos" className="underline">Eliminar datos</a>.
      </p>

      <h2>5. Seguridad</h2>
      <p>
        Toda la comunicación usa HTTPS. Los tokens de acceso de Meta no son accesibles desde el
        navegador y el acceso a los datos está restringido por negocio.
      </p>

      <h2>6. Contacto</h2>
      <p>
        Para dudas sobre privacidad escríbenos a <Contact />.
      </p>

      <hr className="my-10 border-neutral-200" />

      <h2>English summary</h2>
      <p>
        {site.name} is operated by {site.company}. When a business connects its WhatsApp Business
        account through Meta&apos;s Embedded Signup, we store its account identifiers, business phone
        number, the messages it sends and receives (including up to 180 days of history the business
        chooses to share), its contacts, and a Meta access token kept server-side only. We use this
        data solely to show the business its own conversations, generate analytics for it (topics,
        response times, sales opportunities, sentiment), and send messages or manage message
        templates when the business requests it. We do not sell data or use it for advertising.
        Processors: Meta, Supabase, Vercel and AI providers used only to produce the requested
        analytics. Data is kept while the account is active and deleted within 30 days of a
        deletion request (see <a href="/eliminar-datos" className="underline">Data deletion</a>).
        Contact: <Contact />.
      </p>
    </LegalPage>
  );
}
