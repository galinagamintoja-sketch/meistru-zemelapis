import { NextResponse } from "next/server";
import { getCategories } from "../../../lib/specialists";

export async function GET() {
  const categories = await getCategories({ publicLabelsOnly: true });
  return NextResponse.json({ categories });
}
