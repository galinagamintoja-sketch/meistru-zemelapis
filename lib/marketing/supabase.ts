import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function crmPublicConfig() {
  const url = process.env.CRM_SUPABASE_URL;
  const key = process.env.CRM_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("CRM Supabase public environment variables are required");
  return { url, key };
}

export async function createMarketingAuthClient() {
  const cookieStore = await cookies();
  const { url, key } = crmPublicConfig();
  return createServerClient(url, key, {
    auth: { storageKey: "localpro-crm-auth" },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(items) {
        try {
          items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; route handlers can.
        }
      },
    },
  });
}

export function createMarketingServerSupabase() {
  const url = process.env.CRM_SUPABASE_URL;
  const serviceRoleKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("CRM Supabase server environment variables are required");
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
