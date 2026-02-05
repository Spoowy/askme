"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import Image from "next/image";

type Message = { role: "user" | "assistant"; content: string };
type AuthStep = "email" | "code" | "done";
type Conversation = { id: number; title: string; created_at: string };

const FREE_LIMIT = 10;

// Intro message from Erwin
const INTRO_MESSAGE = `Most AI gives you answers. This one only asks questions.

I built this because I noticed something: the more we let AI think for us, the less we actually think ourselves.

What if AI could do the opposite? What if instead of making us passive, it made us active thinkers?

That's what this is — a companion that helps you find answers, not one that hands them to you.

Try it. Hit start.`;

// Typewriter hook with natural pauses and corrections
function useTypewriter(text: string, start = false) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!start) return;
    let cancelled = false;

    // Words to "rethink" - delete and replace with better version
    const corrections: Record<string, string> = {
      "noticed something:": "realized something:",
      "do the opposite?": "make us sharper?",
    };

    const run = async () => {
      let current = "";
      let i = 0;

      while (i < text.length && !cancelled) {
        current += text[i];
        setDisplayed(current);
        i++;

        // Check if we just typed a correction trigger
        for (const [wrong, right] of Object.entries(corrections)) {
          if (current.endsWith(wrong)) {
            // Pause, then delete the wrong word
            await sleep(600);
            for (let j = 0; j < wrong.length && !cancelled; j++) {
              current = current.slice(0, -1);
              setDisplayed(current);
              await sleep(30);
            }
            // Pause, then type the right word
            await sleep(300);
            for (const char of right) {
              if (cancelled) break;
              current += char;
              setDisplayed(current);
              await sleep(50);
            }
            break;
          }
        }

        // Natural pauses after punctuation
        if (text[i - 1] === "." || text[i - 1] === "?") {
          await sleep(400);
        } else if (text[i - 1] === ",") {
          await sleep(200);
        } else if (text[i - 1] === "\n") {
          await sleep(300);
        } else {
          // Base typing speed with slight randomness
          await sleep(50 + Math.random() * 30);
        }
      }

      if (!cancelled) setDone(true);
    };

    run();
    return () => { cancelled = true; };
  }, [text, start]);

  const skip = () => { setDisplayed(text.replace("noticed something:", "realized something:").replace("do the opposite?", "make us sharper?")); setDone(true); };
  return { displayed, done, skip };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [msgCount, setMsgCount] = useState(0);

  // Intro state
  const [showIntro, setShowIntro] = useState(true);
  const [introReady, setIntroReady] = useState(false);

  // Auth state
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authStep, setAuthStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Conversation state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConvId, setCurrentConvId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const { displayed, done, skip } = useTypewriter(INTRO_MESSAGE, introReady);

  // Check if intro was seen
  useEffect(() => {
    if (localStorage.getItem("aq_intro_seen")) setShowIntro(false);
    else setTimeout(() => setIntroReady(true), 500);
  }, []);

  // Check session and get server count on mount
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((data) => {
      if (data.user) {
        setUser(data.user);
        // Fetch conversations for logged-in users
        fetch("/api/conversations").then((r) => r.json()).then((convData) => {
          if (convData.conversations) setConversations(convData.conversations);
        });
      }
    });
    fetch("/api/count").then((r) => r.json()).then((data) => {
      if (data.count !== undefined) setMsgCount(data.count);
    });
  }, []);

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check if should show auth wall
  useEffect(() => {
    if (!user && msgCount >= FREE_LIMIT) setShowAuth(true);
  }, [msgCount, user]);

  const handleContinue = () => {
    localStorage.setItem("aq_intro_seen", "true");
    setShowIntro(false);
  };

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading || showAuth) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, userMessage: userMsg.content, conversationId: currentConvId }),
      });
      const data = await res.json();

      if (data.error === "limit_reached") {
        setMessages(messages);
        setMsgCount(data.count || FREE_LIMIT);
        setShowAuth(true);
        return;
      }

      if (data.message) {
        setMessages([...newMessages, { role: "assistant", content: data.message }]);
        if (!user && data.count !== undefined) setMsgCount(data.count);

        // Update conversation state for logged-in users
        if (user && data.conversationId) {
          if (!currentConvId) {
            setCurrentConvId(data.conversationId);
            // Refresh conversations list
            fetch("/api/conversations").then((r) => r.json()).then((convData) => {
              if (convData.conversations) setConversations(convData.conversations);
            });
          }
        }
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.success) setAuthStep("code");
      else setAuthError(data.error || "Failed to send code");
    } catch {
      setAuthError("Failed to send code");
    } finally {
      setAuthLoading(false);
    }
  };

  const verifyCode = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (data.success) {
        setUser({ email });
        setShowAuth(false);
        setAuthStep("email");
        setCode("");
        window.location.reload();
      } else {
        setAuthError(data.error || "Invalid code");
      }
    } catch {
      setAuthError("Verification failed");
    } finally {
      setAuthLoading(false);
    }
  };

  // Load a conversation
  const loadConversation = async (convId: number) => {
    const res = await fetch(`/api/conversations/${convId}`);
    const data = await res.json();
    if (data.messages) {
      setMessages(data.messages);
      setCurrentConvId(convId);
      setSidebarOpen(false);
    }
  };

  // Start new conversation
  const newConversation = () => {
    setMessages([]);
    setCurrentConvId(null);
    setSidebarOpen(false);
  };

  // Intro screen
  if (showIntro) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-stone-50">
        <div className="max-w-lg w-full">
          {/* Chat-like intro from Erwin */}
          <div className="flex gap-3 items-start">
            <Image
              src="/erwin.jpg"
              alt="Erwin"
              width={48}
              height={48}
              className="rounded-full flex-shrink-0"
              priority
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-stone-700 mb-2">Erwin</p>
              <div className="bg-white border border-stone-200 rounded-2xl rounded-tl-sm px-4 py-3 text-stone-700 whitespace-pre-line">
                {displayed}
                {!done && <span className="inline-block w-0.5 h-4 bg-stone-400 ml-0.5 animate-pulse align-middle" />}
              </div>
            </div>
          </div>

          {/* Continue button */}
          <div className={`mt-8 flex flex-col items-center gap-3 transition-opacity duration-500 ${done ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
            <button
              onClick={handleContinue}
              className="px-8 py-3 bg-stone-800 text-white rounded-full hover:bg-stone-700 transition font-medium"
            >
              Start Thinking
            </button>
          </div>

          {/* Skip */}
          {!done && introReady && (
            <button onClick={skip} className="block mx-auto mt-6 text-stone-400 text-sm hover:text-stone-600 transition">
              Skip
            </button>
          )}
        </div>
      </main>
    );
  }

  const hasStarted = messages.length > 0;

  // Main chat
  return (
    <div className="min-h-screen bg-stone-50 flex">
      {/* Sidebar for logged-in users */}
      {user && (
        <>
          {/* Mobile toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="fixed top-4 left-4 z-50 p-2 bg-white border border-stone-200 rounded-lg shadow-sm md:hidden"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Sidebar */}
          <aside className={`fixed md:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-stone-200 transform transition-transform ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
            <div className="p-4 h-full flex flex-col">
              <button
                onClick={newConversation}
                className="w-full px-4 py-2 mb-4 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition text-sm"
              >
                + New conversation
              </button>

              <div className="flex-1 overflow-y-auto space-y-1">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => loadConversation(conv.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition ${
                      currentConvId === conv.id ? "bg-stone-100 text-stone-900" : "text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    {conv.title}
                  </button>
                ))}
                {conversations.length === 0 && (
                  <p className="text-stone-400 text-xs text-center py-4">No conversations yet</p>
                )}
              </div>

              <div className="pt-4 border-t border-stone-100 text-xs text-stone-400">
                {user.email}
              </div>
            </div>
          </aside>

          {/* Overlay for mobile */}
          {sidebarOpen && (
            <div className="fixed inset-0 bg-black/20 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
          )}
        </>
      )}

      <main className="flex-1 max-w-2xl mx-auto p-4 min-h-screen flex flex-col">

      {/* Header with login for non-users */}
      {!user && (
        <div className="flex justify-end py-2">
          <button
            onClick={() => setShowAuth(true)}
            className="text-sm text-stone-500 hover:text-stone-700 transition"
          >
            Sign in
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 space-y-4 pb-4">
        {!hasStarted && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <p className="text-2xl text-stone-600 mb-8">What are you trying to figure out?</p>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[75%] px-4 py-3 rounded-2xl rounded-br-sm whitespace-pre-wrap bg-stone-800 text-white">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <Image src="/erwin.jpg" alt="Erwin" width={36} height={36} className="rounded-full" />
              </div>
              <div className="max-w-[75%] px-4 py-3 rounded-2xl rounded-tl-sm whitespace-pre-wrap bg-white border border-stone-200 text-stone-700">
                {m.content}
              </div>
            </div>
          )
        )}
        {loading && (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <Image src="/erwin.jpg" alt="Erwin" width={36} height={36} className="rounded-full" />
            </div>
            <div className="bg-white border border-stone-200 px-4 py-3 rounded-2xl rounded-tl-sm text-stone-300">...</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Auth modal */}
      {showAuth && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full relative">
            {/* Close button - only show if not at limit */}
            {msgCount < FREE_LIMIT && (
              <button
                onClick={() => { setShowAuth(false); setAuthStep("email"); setAuthError(""); }}
                className="absolute top-4 right-4 text-stone-400 hover:text-stone-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            <h2 className="text-xl font-medium mb-2 text-center">
              {msgCount >= FREE_LIMIT ? "Continue your journey" : "Sign in"}
            </h2>
            <p className="text-stone-500 mb-6 text-sm text-center">
              {authStep === "email" ? "Enter your email to keep learning" : "Enter the 6-digit code we sent you"}
            </p>

            {authStep === "email" ? (
              <form onSubmit={sendCode} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-300"
                  required
                  disabled={authLoading}
                />
                {authError && <p className="text-red-500 text-sm">{authError}</p>}
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-stone-800 text-white py-3 rounded-xl hover:bg-stone-700 transition disabled:opacity-50"
                >
                  {authLoading ? "Sending..." : "Send verification code"}
                </button>
              </form>
            ) : (
              <form onSubmit={verifyCode} className="space-y-3">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-300 text-center text-2xl tracking-widest"
                  required
                  disabled={authLoading}
                />
                {authError && <p className="text-red-500 text-sm text-center">{authError}</p>}
                <button
                  type="submit"
                  disabled={authLoading || code.length !== 6}
                  className="w-full bg-stone-800 text-white py-3 rounded-xl hover:bg-stone-700 transition disabled:opacity-50"
                >
                  {authLoading ? "Verifying..." : "Verify"}
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthStep("email"); setCode(""); setAuthError(""); }}
                  className="w-full text-stone-500 text-sm hover:text-stone-700"
                >
                  Use different email
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={sendMessage} className="sticky bottom-0 bg-stone-50 pt-4 pb-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={showAuth ? "Sign in to continue..." : hasStarted ? "..." : "I want to understand..."}
            disabled={loading || showAuth}
            className="flex-1 px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-300 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || showAuth || !input.trim()}
            className="px-6 py-3 bg-stone-800 text-white rounded-xl hover:bg-stone-700 disabled:opacity-50 transition"
          >
            &rarr;
          </button>
        </div>
        {!user && !hasStarted && (
          <p className="text-center text-xs text-stone-300 mt-3">
            {FREE_LIMIT - msgCount} questions to start
          </p>
        )}
      </form>

      </main>
    </div>
  );
}
