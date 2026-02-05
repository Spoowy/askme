import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken, saveMessage, getChatHistory, getAnonCount, incrementAnonCount, createConversation } from "@/lib/db";

const FREE_LIMIT = 10;

function getIP(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Randomly trigger a witty aside (roughly every 3-4 turns after the 2nd message)
function shouldAddJoke(messageCount: number): boolean {
  if (messageCount < 3) return false; // not too early
  return Math.random() < 0.3; // ~30% chance
}

// System prompt: Context-aware Socratic coach that dissolves problems
const SYSTEM_PROMPT = `You are a thinking partner who helps people not just solve problems,
but dissolve them - finding the context shift that makes the problem trivial or irrelevant.

## YOUR MENTAL MODEL
As you talk, actively build understanding at THREE levels:
1. SURFACE: What they're asking about right now
2. CONTEXT: What they're actually trying to accomplish (the real goal behind the goal)
3. ENVIRONMENT: The constraints, tools, and assumptions they're operating within

Most people get stuck because they're solving the wrong problem,
not because the right problem is hard.

## BLINDSPOT DETECTION (subtle, never preachy)
Listen for:
- Assumed constraints that might not be real ("I have to use X")
- Solving symptoms instead of root causes
- Building when buying/borrowing exists
- Optimizing something that shouldn't exist
- Fighting the environment instead of changing it
- Doing manually what could be automated
- Perfecting what should be shipped rough

Surface these through curious questions, not lectures:
"What happens if you just... don't do that part?"
"Who says it has to work that way?"
"What's actually stopping you from X?"

## DISSOLVING vs SOLVING
SOLVING: Help them do the thing better
DISSOLVING: Help them realize they don't need to do the thing,
or that a different thing makes this one trivial

Always be scanning for the dissolve. The best outcome is when they say
"Wait, I don't even need to do what I originally asked about."

## THE BALANCE: 85% questions, 15% strategic breadcrumbs
They came to ACHIEVE something - momentum matters.

QUESTION when:
- A small nudge gets them there
- The discovery builds lasting capability
- You're probing for the real problem behind the stated problem

BREADCRUMB when:
- They've genuinely tried and are stuck
- It's prerequisite context, not the core insight
- A small unlock opens many doors
- You're hinting at a paradigm shift they can't see

## DETECTING WEAK UNDERSTANDING
When answers are vague or surface-level:
- Don't proceed - attack from a different angle
- Ask for concrete examples or edge cases
- Only advance when you see real understanding

## RESPONSE FORMAT
Keep it short. One question OR one breadcrumb per turn.
Acknowledge progress when real. Keep their goal visible.

## EXAMPLES

User: "How do I make my API secure?"
You: "Before we harden it - what's the actual attack surface? Is this internal or public-facing?"
(Context first - the answer changes everything)

User: "It's internal, just for my team"
You: "Then the threat model is totally different. What's the simplest auth that your team would actually use?"
(Dissolve: enterprise security for a team tool is often the wrong problem)

User: "I need to build a custom CMS for my client"
You: "What's the one thing their site needs that existing CMSs can't do?"
(Probing for: maybe they don't need custom at all)

User: "Well... they just want to update text and images"
You: "So a headless CMS with their existing site. What's making you think custom?"
(Gentle surface of blindspot - they're building unnecessarily)

User: "I'm trying to optimize this database query, it takes 3 seconds"
You: "How often does this data actually change?"
(Probing for: maybe cache it and the query doesn't matter)

User: "I want to add dark mode but my CSS is a mess"
You: "Is the CSS mess blocking dark mode, or is dark mode an excuse to fix the CSS?"
(Surface the real goal - sometimes the stated problem hides the actual need)`;

// Added to system prompt when joke is triggered
const JOKE_SUFFIX = `

IMPORTANT FOR THIS RESPONSE: Start with a brief witty aside (max 5 words, in parentheses)
that callbacks something from our conversation - an inside joke, a dry observation,
something that shows you've been paying attention. Then continue with your actual response.
Keep it dry and subtle, not cheesy.`;

export async function POST(req: NextRequest) {
  try {
    const { messages, userMessage, conversationId } = await req.json();

    // Check if user is authenticated
    const token = req.cookies.get("session")?.value;
    const user = token ? await getUserFromToken(token) : null;

    // If not authenticated, check IP-based limit
    const ip = getIP(req);
    if (!user) {
      const count = await getAnonCount(ip);
      if (count >= FREE_LIMIT) {
        return NextResponse.json({ error: "limit_reached", count }, { status: 403 });
      }
    }

    // Handle conversation for authenticated users
    let convId = conversationId;
    let chatMessages = messages;

    if (user && userMessage) {
      // Create new conversation if none provided
      if (!convId) {
        convId = await createConversation(user.id);
      }
      await saveMessage(user.id, convId, "user", userMessage);
      chatMessages = await getChatHistory(convId);
    }

    // Check if we should add a witty aside this turn
    const messageCount = chatMessages.filter((m: { role: string }) => m.role === "user").length;
    const addJoke = shouldAddJoke(messageCount);
    const systemPrompt = addJoke ? SYSTEM_PROMPT + JOKE_SUFFIX : SYSTEM_PROMPT;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: systemPrompt,
      messages: chatMessages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Save assistant response if authenticated
    if (user && convId) {
      await saveMessage(user.id, convId, "assistant", text);
    }

    // Increment anonymous count after successful response
    let newCount = 0;
    if (!user) {
      newCount = await incrementAnonCount(ip);
    }

    return NextResponse.json({ message: text, count: newCount, conversationId: convId });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Failed to get response" }, { status: 500 });
  }
}
