import type { Metadata } from "next";
import LegalPage, { Contact } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: `Términos de servicio · ${site.name}` };

export default function TermsPage() {
  return (
    <LegalPage title="Términos de servicio / Terms of Service">
      <p>
        Al usar {site.name}, operado por {site.company}, aceptas estos términos.
      </p>

      <h2>1. El servicio</h2>
      <p>
        {site.name} permite a negocios conectar su cuenta de WhatsApp Business mediante la
        plataforma oficial de Meta para consultar y analizar sus conversaciones, enviar mensajes y
        gestionar plantillas de mensaje.
      </p>

      <h2>2. Responsabilidades del negocio</h2>
      <ul>
        <li>Ser titular o estar autorizado para administrar la cuenta de WhatsApp Business que conecta.</li>
        <li>
          Cumplir las políticas de WhatsApp Business y de Meta, incluyendo obtener el consentimiento
          de sus clientes para comunicarse por WhatsApp.
        </li>
        <li>Informar a sus clientes sobre el tratamiento de sus datos según la ley aplicable.</li>
        <li>Mantener la confidencialidad de sus credenciales de acceso.</li>
      </ul>

      <h2>3. Uso prohibido</h2>
      <p>
        No está permitido usar la plataforma para enviar spam, contenido ilegal o mensajes no
        solicitados, ni para acceder a cuentas de terceros sin autorización.
      </p>

      <h2>4. Disponibilidad</h2>
      <p>
        El servicio depende de la disponibilidad de WhatsApp Business Platform. No garantizamos que
        Meta entregue la totalidad del historial; esto depende de lo que el negocio autorice y de los
        límites de Meta.
      </p>

      <h2>5. Terminación</h2>
      <p>
        Puedes dejar de usar el servicio y solicitar la eliminación de tus datos en cualquier momento
        (ver <a href="/eliminar-datos" className="underline">Eliminar datos</a>). Podemos suspender
        cuentas que incumplan estos términos o las políticas de Meta.
      </p>

      <h2>6. Contacto</h2>
      <p>
        <Contact />
      </p>

      <hr className="my-10 border-neutral-200" />

      <h2>English summary</h2>
      <p>
        {site.name} lets businesses connect their WhatsApp Business account through Meta&apos;s
        official platform to view and analyze their conversations, send messages and manage message
        templates. Businesses must own or be authorized to manage the connected account, comply with
        WhatsApp Business and Meta policies (including customer opt-in), and must not use the
        service for spam or unlawful content. Users may stop using the service and request data
        deletion at any time. Contact: <Contact />.
      </p>
    </LegalPage>
  );
}
