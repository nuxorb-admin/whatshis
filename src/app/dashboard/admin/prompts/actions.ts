"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PROMPTS, type PromptKey } from "@/lib/analysis/prompts";

export type PromptActionState = { ok: boolean; message: string } | null;

const isKey = (k: unknown): k is PromptKey => k === "conversation" || k === "summary";

async function insertVersion(key: PromptKey, content: string, note: string | null): Promise<PromptActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!user || !isAdmin) return { ok: false, message: "Solo administradores" };

  const trimmed = content.trim();
  if (!trimmed) return { ok: false, message: "El prompt no puede estar vacío" };
  if (trimmed.length > 20000) return { ok: false, message: "El prompt es demasiado largo (máx. 20,000 caracteres)" };

  // RLS: la política solo permite insertar a administradores y con created_by = su propio id.
  const { error } = await supabase
    .from("prompt_versions")
    .insert({ key, content: trimmed, note: note?.trim() || null, created_by: user.id });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/admin/prompts");
  return { ok: true, message: "Guardado. El próximo análisis usará esta versión y volverá a analizar todas las conversaciones." };
}

export async function savePromptAction(_prev: PromptActionState, formData: FormData): Promise<PromptActionState> {
  const key = formData.get("key");
  if (!isKey(key)) return { ok: false, message: "Prompt desconocido" };

  if (formData.get("intent") === "default") {
    return insertVersion(key, DEFAULT_PROMPTS[key], "Restaurado al predeterminado");
  }
  return insertVersion(key, String(formData.get("content") ?? ""), String(formData.get("note") ?? ""));
}

export async function restoreVersionAction(formData: FormData) {
  const supabase = await createClient();
  const { data: version } = await supabase
    .from("prompt_versions")
    .select("key, content, created_at")
    .eq("id", String(formData.get("version_id")))
    .maybeSingle();
  if (!version || !isKey(version.key)) return;
  await insertVersion(version.key, version.content, `Restaurada la versión del ${new Date(version.created_at).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}`);
}
