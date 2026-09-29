function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  metaAppId: () => required("NEXT_PUBLIC_META_APP_ID"),
  metaAppSecret: () => required("META_APP_SECRET"),
  metaConfigId: () => required("NEXT_PUBLIC_META_CONFIG_ID"),
  metaWebhookVerifyToken: () => required("META_WEBHOOK_VERIFY_TOKEN"),
  graphVersion: () => process.env.META_GRAPH_VERSION ?? "v25.0",
};
