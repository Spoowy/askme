import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken, getConversations, createConversation, getChatHistory, deleteConversation } from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversations = await getConversations(user.id);
  return NextResponse.json({ conversations });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = await createConversation(user.id);
  return NextResponse.json({ id });
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  await deleteConversation(id);
  return NextResponse.json({ success: true });
}
