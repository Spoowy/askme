import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken, getChatHistory } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get("session")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const messages = await getChatHistory(parseInt(id, 10));
  return NextResponse.json({ messages });
}
