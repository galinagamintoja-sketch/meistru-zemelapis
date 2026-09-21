import { createMarketingAuthClient } from "./supabase";

export function getMarketingAdminAllowlist() {
  return (process.env.CRM_ADMIN_EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isMarketingAdminEmail(email?: string | null) {
  return Boolean(email && getMarketingAdminAllowlist().includes(email.trim().toLowerCase()));
}

export async function requireMarketingAdminSession() {
  const supabase = await createMarketingAuthClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email || !isMarketingAdminEmail(user.email)) return null;
  return {
    email: user.email,
    name: String(user.user_metadata?.full_name ?? user.email),
    userId: user.id,
  };
}
