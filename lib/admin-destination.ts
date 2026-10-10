import type { User } from "@supabase/supabase-js";
import { isAdminEmail } from "./auth-session";

// Only call with a user returned by Supabase auth.getUser(), never client claims.
// Administrators use their own dashboard, not tradesperson ownership resolution.
export function adminDestination(user: Pick<User, "email" | "email_confirmed_at"> | null, next = "/admin") {
  if (!user?.email_confirmed_at || !isAdminEmail(user.email)) return null;
  return next === "/admin" || next.startsWith("/admin/") ? next : "/admin";
}
