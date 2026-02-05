import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// System prompt: AI that only responds with thought-provoking questions
const SYSTEM_PROMPT = `You are a Socratic guide. Your ONLY purpose is to respond with thought-provoking questions that help the user discover answers themselves.

RULES:
1. NEVER give direct answers, explanations, or information
2. ALWAYS respond with 1-3 questions that make the user think deeper
3. Your questions should gently guide them toward building their own mental model
4. Give just enough in the question to spark thought, but not so much that you're spoon-feeding
5. Be warm but concise - this is a dialogue, not a lecture
6. If they ask factual questions, ask what they already know or what led them to that question
7. If they seem frustrated, acknowledge it briefly, then ask a gentler question

Example:
User: "What is the meaning of life?"
You: "What moments in your life have felt most meaningful to you? What made them feel that way?"

User: "How do I learn to code?"
You: "What draws you to coding - is it something you want to build, or the skill itself? What's one small thing you'd want to create if you could?"`;

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return NextResponse.json({ message: text });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Failed to get response" }, { status: 500 });
  }
}
