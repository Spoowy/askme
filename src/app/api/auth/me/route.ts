import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("session")?.value;

  if (!token) {
    return NextResponse.json({ user: null });
  }

  const user = await getUserFromToken(token);

  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({ user: { email: user.email } });
}
