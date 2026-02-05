import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken, getChatHistory } from "@/lib/db";

// Split assistant messages that contain --- delimiter into separate messages
function expandMessages(messages: { role: string; content: string }[]) {
  const expanded: { role: string; content: string }[] = [];
  for (const msg of messages) {
    if (msg.role === "assistant" && msg.content.includes("\n---\n")) {
      const parts = msg.content.split(/\n---\n/).map(s => s.trim()).filter(Boolean);
      for (const part of parts) {
        expanded.push({ role: "assistant", content: part });
      }
    } else {
      expanded.push(msg);
    }
  }
  return expanded;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get("session")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const messages = await getChatHistory(parseInt(id, 10));
  return NextResponse.json({ messages: expandMessages(messages) });
}
