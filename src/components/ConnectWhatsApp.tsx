"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type SessionInfo = { phone_number_id: string; waba_id: string; business_id?: string };

type FBLoginResponse = { authResponse?: { code?: string } | null };

declare global {
  interface Window {
    FB?: {
      init: (opts: Record<string, unknown>) => void;
      login: (cb: (r: FBLoginResponse) => void, opts: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const GRAPH_VERSION = "v25.0";

export default function ConnectWhatsApp() {
  const router = useRouter();
  const [sdkReady, setSdkReady] = useState(false);
  const [state, setState] = useState<"idle" | "waiting" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  // El código (callback de FB.login) y los IDs (evento postMessage) llegan por separado.
  const code = useRef<string | null>(null);
  const session = useRef<SessionInfo | null>(null);

  const finish = useCallback(async () => {
    if (!code.current || !session.current) return;
    setState("saving");
    const res = await fetch("/api/whatsapp/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.current, ...session.current }),
    });
    const data = await res.json();
    code.current = null;
    session.current = null;
    if (res.ok) {
      setState("done");
      setMessage("¡Conectado! Estamos importando tu historial; puede tardar un rato.");
      router.refresh();
    } else {
      setState("error");
      setMessage(data.error ?? "No se pudo conectar");
    }
  }, [router]);

  useEffect(() => {
    window.fbAsyncInit = () => {
      window.FB!.init({
        appId: process.env.NEXT_PUBLIC_META_APP_ID,
        autoLogAppEvents: true,
        xfbml: true,
        version: GRAPH_VERSION,
      });
      setSdkReady(true);
    };
    if (window.FB) window.fbAsyncInit();

    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) return;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;

      if (data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" || data.event === "FINISH") {
        session.current = {
          phone_number_id: data.data.phone_number_id,
          waba_id: data.data.waba_id,
          business_id: data.data.business_id,
        };
        finish();
      } else if (data.event === "CANCEL") {
        setState("error");
        setMessage(
          data.data?.error_message
            ? `Error: ${data.data.error_message}`
            : `Proceso cancelado${data.data?.current_step ? ` en el paso ${data.data.current_step}` : ""}.`,
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [finish]);

  const launch = () => {
    setState("waiting");
    setMessage(null);
    window.FB!.login(
      (response) => {
        const c = response.authResponse?.code;
        if (!c) {
          setState((s) => (s === "error" ? s : "idle"));
          return;
        }
        code.current = c;
        finish();
      },
      {
        config_id: process.env.NEXT_PUBLIC_META_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "whatsapp_business_app_onboarding", // coexistencia
          sessionInfoVersion: "3",
        },
      },
    );
  };

  return (
    <div className="space-y-3">
      <Script src="https://connect.facebook.net/en_US/sdk.js" strategy="afterInteractive" crossOrigin="anonymous" />
      <button
        onClick={launch}
        disabled={!sdkReady || state === "waiting" || state === "saving"}
        className="rounded-lg bg-[#25D366] px-5 py-2.5 font-medium text-white shadow-sm transition hover:bg-[#1ebe5b] disabled:opacity-50"
      >
        {state === "saving" ? "Conectando…" : "Conectar WhatsApp Business"}
      </button>
      {message && (
        <p className={state === "error" ? "text-sm text-red-600" : "text-sm text-green-700"}>{message}</p>
      )}
      <p className="text-xs text-neutral-500">
        Escanea el código QR con tu app de WhatsApp Business y acepta compartir el historial. Tu app
        seguirá funcionando igual.
      </p>
    </div>
  );
}
