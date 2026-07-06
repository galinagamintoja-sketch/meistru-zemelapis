import { NextResponse } from "next/server";
import { getSpecialist } from "../../../../lib/specialists";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const specialist = await getSpecialist(id);

  if (!specialist || specialist.status !== "approved") {
    return NextResponse.json({ error: "Specialistas nerastas" }, { status: 404 });
  }

  return NextResponse.json({ specialist });
}
