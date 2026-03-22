import { NextResponse } from "next/server";
import { MOCK_MODE_ENABLED } from "@/lib/config";

export async function GET() {
  return NextResponse.json({ mock: MOCK_MODE_ENABLED });
}
