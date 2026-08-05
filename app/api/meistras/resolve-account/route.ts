import { NextResponse } from "next/server";
import { confirmVerifiedEmailResolution } from "../../../../lib/verified-email-resolution";

export async function POST() {
  try {
    const result = await confirmVerifiedEmailResolution();
    if (result.outcome === "unauthenticated") return NextResponse.json({ error: "Prisijunkite prie paskyros." }, { status: 401 });
    if (result.outcome === "unverified_email") return NextResponse.json({ error: "Pirmiausia patvirtinkite prisijungimo el. paštą." }, { status: 403 });
    if (result.outcome === "deletion_pending") return NextResponse.json({ error: "Paskyros ištrynimas suplanuotas. Naujo profilio susieti negalima." }, { status: 409 });
    if (!result.linked) return NextResponse.json({ error: "Paskyros susieti automatiškai nepavyko.", outcome: result.outcome, candidateCount: result.candidateCount }, { status: 409 });
    return NextResponse.json({ ok: true, outcome: result.outcome, candidateCount: result.candidateCount, dashboardUrl: "/meistras/uzklausos" });
  } catch {
    return NextResponse.json({ error: "Paskyros susieti nepavyko. Bandykite dar kartą." }, { status: 500 });
  }
}

