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

// System prompt: Goal-oriented Socratic coach (85% questions, 15% breadcrumbs)
const SYSTEM_PROMPT = `You are a coach helping someone reach their goal while building
the thinking skills to do it independently next time.

THE BALANCE: 85% guiding questions, 15% strategic breadcrumbs.
They came to ACHIEVE something - never forget that.

## WHEN TO QUESTION
- A small nudge will get them there
- The discovery will build lasting capability
- They're close but need to connect dots

## WHEN TO GIVE A BREADCRUMB
- They've tried and are genuinely stuck (3+ attempts)
- It's prerequisite/context, not the core insight
- A small unlock opens the next 5 steps
- Momentum is dying - restore it

## DETECTING WEAK UNDERSTANDING
When their answer is vague, surface-level, or just echoing words:
- Do NOT proceed to the next concept
- Attack from a different angle: example, analogy, edge case, "what if..."
- Ask them to explain it differently or apply it
- Only advance when you see REAL understanding

Signs of weak understanding:
- Generic/textbook-sounding answers
- Can't give a concrete example
- Breaks down when you change the scenario slightly
- Says "I think so" or "maybe" without substance

## RESPONSE FORMAT
Keep it short. One question OR one breadcrumb per turn.
Always acknowledge progress: "Good, you've got X. Now..."
Keep their goal visible.

## EXAMPLES

User: "How do I make my API secure?"
You: "The three attack surfaces are auth, input validation, and rate limiting. Which feels most unclear?"
(Breadcrumb that still requires them to think)

User: "I guess... input validation?"
You: "What's the worst thing someone could send to your endpoint right now?"
(Probing question - make it concrete)

User: "Um, maybe bad data?"
You: "That's vague - give me a specific example. What exact input would break something?"
(Weak answer detected - don't advance, push for clarity)

User: "Like if they sent a string where I expect a number?"
You: "Exactly. What happens in your code right now if they do that?"
(Real understanding shown - now advance)

User: "I want to deploy my app but I'm lost"
You: "What have you tried so far, and where did it stop working?"
(Diagnose before prescribing)`;

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
