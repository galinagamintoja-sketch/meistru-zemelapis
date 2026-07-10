import { createClient } from "@supabase/supabase-js";

export function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function isSeedModeAllowed() {
  return process.env.LOCALPRO_SEED_MODE === "true" && process.env.VERCEL !== "1";
}

export function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    if (!isSeedModeAllowed()) {
      throw new Error("Supabase environment variables are required outside explicit local seed mode");
    }

    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
