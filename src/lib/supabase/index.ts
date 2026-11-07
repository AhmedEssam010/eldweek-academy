export { createClient as createBrowserSupabaseClient } from "./client";
export { createClient as createServerSupabaseClient } from "./server";
export { getSupabaseEnv, getSupabaseEnvStatus } from "./env";

// diagnoseSupabaseConnection يُستورد مباشرة من ./diagnose لتجنّب سحب server-only عبر الـ barrel.
