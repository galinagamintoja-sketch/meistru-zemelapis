"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type IconName = "requests" | "profile" | "photos" | "services" | "account";

export const tradespersonNavigation = [
  { href: "/meistras/uzklausos", label: "Užklausos", mobileLabel: "Užklausos", icon: "requests" },
  { href: "/meistras/profilis", label: "Mano profilis", mobileLabel: "Profilis", icon: "profile" },
  { href: "/meistras/nuotraukos", label: "Nuotraukos", mobileLabel: "Nuotraukos", icon: "photos" },
  { href: "/meistras/paslaugos", label: "Paslaugos", mobileLabel: "Paslaugos", icon: "services" },
  { href: "/meistras/paskyra", label: "Paskyra", mobileLabel: "Paskyra", icon: "account" }
] satisfies ReadonlyArray<{ href: string; label: string; mobileLabel: string; icon: IconName }>;

export function TradespersonNavigation({ mobile = false, deletionPending = false }: { mobile?: boolean; deletionPending?: boolean }) {
  const pathname = usePathname();
  return <nav className={mobile ? "tradesperson-bottom-nav" : "tradesperson-side-nav"} aria-label={mobile ? "Mobilioji navigacija" : "Meistro paskyra"}>
    {tradespersonNavigation.filter((item) => !deletionPending || item.icon === "account").map((item) => {
      const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
      return <Link href={item.href} key={item.href} aria-current={active ? "page" : undefined}>
        <DashboardIcon name={item.icon} /><span>{mobile ? item.mobileLabel : item.label}</span>
      </Link>;
    })}
  </nav>;
}

export function DashboardIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    requests: <><path d="M6 3.75h8l4 4V20.25H6z" /><path d="M14 3.75v4h4M9 12h6M9 15.5h4" /></>,
    profile: <><circle cx="12" cy="8" r="3.25" /><path d="M5.5 20c.55-4.15 2.72-6.25 6.5-6.25S17.95 15.85 18.5 20" /></>,
    photos: <><rect x="3.75" y="5" width="16.5" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m5.5 17 4.25-4 2.75 2.25 2.25-2L18.5 17" /></>,
    services: <path d="M14.5 5.2a4.2 4.2 0 0 0-5.7 5.7l-5.05 5.05 4.3 4.3 5.05-5.05a4.2 4.2 0 0 0 5.7-5.7l-2.7 2.7-2.3-.45-.45-2.3z" />,
    account: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6v.25h-4V20a1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1H3.75v-4H4a1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06L7.06 4.2l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6v-.25h4V4a1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 .6 1h.25v4H20a1.7 1.7 0 0 0-.6 1Z" /></>
  };
  return <svg className="dashboard-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
