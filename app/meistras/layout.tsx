import { TradespersonShell } from "../../components/tradesperson-shell";
import { requireTradespersonUser } from "../../lib/tradesperson-account";

export default async function TradespersonLayout({ children }: { children: React.ReactNode }) {
  const user = await requireTradespersonUser();
  const name = String(user.user_metadata?.full_name ?? user.email ?? "Meistras");
  return <TradespersonShell name={name}>{children}</TradespersonShell>;
}
