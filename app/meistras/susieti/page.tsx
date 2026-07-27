import { redirect } from "next/navigation";

export default function DeprecatedProfileClaimPage() {
  redirect("/?register=1#register");
}
