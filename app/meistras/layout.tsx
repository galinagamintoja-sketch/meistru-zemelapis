import { TradespersonShell } from "../../components/tradesperson-shell";
import { requireOwnedProfile } from "../../lib/tradesperson-account";

export default async function TradespersonLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireOwnedProfile();
  const name = String(profile?.display_name ?? user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "Meistras");
  const subtitle = profile?.company_name ?? profile?.service_area_label ?? profile?.base_city ?? null;
  const active = profile?.approval_status === "approved" && profile?.public_status === "public";
  return <TradespersonShell profile={{ name, subtitle, active }}>{children}</TradespersonShell>;
}
