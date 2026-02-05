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

That's what this is — a companion that helps you find answers, not one that hands them to you.`;

// Typewriter hook with natural pauses and corrections
function useTypewriter(text: string, start = false) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!start) return;
    let cancelled = false;

    // Words to "rethink" - delete and replace
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
            await sleep(600);
            for (let j = 0; j < wrong.length && !cancelled; j++) {
              current = current.slice(0, -1);
              setDisplayed(current);
              await sleep(30);
            }
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
        if (text[i - 1] === "." || text[i - 1] === "?") await sleep(250);
        else if (text[i - 1] === ",") await sleep(120);
        else if (text[i - 1] === "\n") await sleep(180);
        else await sleep(25 + Math.random() * 15);
      }

      if (!cancelled) setDone(true);
    };

    run();
    return () => { cancelled = true; };
  }, [text, start]);

  const skip = () => {
    setDisplayed(text.replace("noticed something:", "realized something:").replace("do the opposite?", "make us sharper?"));
    setDone(true);
  };
  return { displayed, done, skip };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function Logo({ size = "default" }: { size?: "default" | "small" }) {
  const isSmall = size === "small";
  return (
    <div className="flex items-center gap-2">
      <div className={`${isSmall ? "w-7 h-7" : "w-8 h-8"} bg-stone-800 dark:bg-stone-200 rounded-lg flex items-center justify-center`}>
        <span className={`text-white dark:text-stone-800 ${isSmall ? "text-base" : "text-lg"} font-bold`}>?</span>
      </div>
      <span className={`font-semibold text-stone-800 dark:text-stone-100 tracking-tight ${isSmall ? "text-sm" : ""}`}>ThinkBack</span>
    </div>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [msgCount, setMsgCount] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [introReady, setIntroReady] = useState(false);
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authStep, setAuthStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConvId, setCurrentConvId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { displayed, done, skip } = useTypewriter(INTRO_MESSAGE, introReady);

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (localStorage.getItem("tb_intro_seen")) setShowIntro(false);
    else setTimeout(() => setIntroReady(true), 500);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((data) => {
      if (data.user) {
        setUser(data.user);
        fetch("/api/conversations").then((r) => r.json()).then((convData) => {
          if (convData.conversations) setConversations(convData.conversations);
        });
      }
    });
    fetch("/api/count").then((r) => r.json()).then((data) => {
      if (data.count !== undefined) setMsgCount(data.count);
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    if (!user && msgCount >= FREE_LIMIT) setShowAuth(true);
  }, [msgCount, user]);

  const handleContinue = () => {
    localStorage.setItem("tb_intro_seen", "true");
    setShowIntro(false);
  };

  const resetTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading || showAuth) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    resetTextarea();
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

      // Handle multiple messages with natural delays
      const responseMsgs: string[] = data.messages || (data.message ? [data.message] : []);
      if (responseMsgs.length > 0) {
        let currentMessages = [...newMessages];

        for (let i = 0; i < responseMsgs.length; i++) {
          currentMessages = [...currentMessages, { role: "assistant" as const, content: responseMsgs[i] }];
          setMessages(currentMessages);

          // Show typing indicator and delay before next message
          if (i < responseMsgs.length - 1) {
            setLoading(true);
            await sleep(600 + Math.random() * 1000); // 0.6-1.6s delay
          }
        }

        if (!user && data.count !== undefined) setMsgCount(data.count);
        if (user && data.conversationId && !currentConvId) {
          setCurrentConvId(data.conversationId);
          fetch("/api/conversations").then((r) => r.json()).then((convData) => {
            if (convData.conversations) setConversations(convData.conversations);
          });
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
      const res = await fetch("/api/auth/send-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await res.json();
      if (data.success) setAuthStep("code");
      else setAuthError(data.error || "Failed to send code");
    } catch { setAuthError("Failed to send code"); }
    finally { setAuthLoading(false); }
  };

  const verifyCode = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code }) });
      const data = await res.json();
      if (data.success) { setUser({ email }); setShowAuth(false); setAuthStep("email"); setCode(""); window.location.reload(); }
      else setAuthError(data.error || "Invalid code");
    } catch { setAuthError("Verification failed"); }
    finally { setAuthLoading(false); }
  };

  const loadConversation = async (convId: number) => {
    const res = await fetch(`/api/conversations/${convId}`);
    const data = await res.json();
    if (data.messages) { setMessages(data.messages); setCurrentConvId(convId); setSidebarOpen(false); }
  };

  const newConversation = () => { setMessages([]); setCurrentConvId(null); setSidebarOpen(false); };

  // Intro screen
  if (showIntro) {
    return (
      <main className="h-[100dvh] flex items-center justify-center p-6 bg-gradient-to-b from-stone-50 to-stone-100 dark:from-stone-900 dark:to-stone-950">
        <div className="max-w-lg w-full">
          <div className="flex justify-center mb-8">
            <Logo />
          </div>

          {/* Chat-like intro from Erwin */}
          <div className="flex gap-3 items-start">
            <div className="flex-shrink-0">
              <Image src="/erwin.jpg" alt="Erwin" width={44} height={44} className="rounded-full" priority />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">Erwin</p>
              <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-2xl rounded-tl-sm px-4 py-3 text-stone-700 dark:text-stone-200 whitespace-pre-line text-[15px] leading-relaxed">
                {displayed}
                {!done && <span className="inline-block w-0.5 h-4 bg-stone-400 ml-0.5 animate-pulse align-middle" />}
              </div>
            </div>
          </div>

          {/* Continue button */}
          <div className={`mt-8 flex flex-col items-center gap-3 transition-opacity duration-500 ${done ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
            <button onClick={handleContinue} className="px-8 py-3 bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-900 rounded-full hover:bg-stone-700 dark:hover:bg-stone-200 transition font-medium">
              Start thinking
            </button>
            <p className="text-stone-400 text-xs">Free to try. No account needed.</p>
          </div>

          {/* Skip */}
          {!done && introReady && (
            <button onClick={skip} className="block mx-auto mt-6 text-stone-400 text-sm hover:text-stone-300 transition">
              Skip
            </button>
          )}
        </div>
      </main>
    );
  }

  const hasStarted = messages.length > 0;

  return (
    <div className="h-[100dvh] flex bg-stone-50 dark:bg-stone-900 overflow-hidden">
      {/* Sidebar - Fixed on desktop */}
      {user && (
        <>
          <aside className={`fixed md:relative inset-y-0 left-0 z-40 w-64 bg-white dark:bg-stone-800 border-r border-stone-100 dark:border-stone-700 flex flex-col transform transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
            <div className="p-4 border-b border-stone-100 dark:border-stone-700">
              <Logo size="small" />
            </div>
            <div className="p-3">
              <button onClick={newConversation} className="w-full px-4 py-2.5 bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg hover:bg-stone-700 dark:hover:bg-stone-200 transition text-sm font-medium">
                + New conversation
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 space-y-1">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition ${currentConvId === conv.id ? "bg-stone-100 dark:bg-stone-700 text-stone-900 dark:text-stone-100" : "text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700 hover:text-stone-700 dark:hover:text-stone-200"}`}
                >
                  {conv.title}
                </button>
              ))}
              {conversations.length === 0 && <p className="text-stone-400 text-xs text-center py-8">No conversations yet</p>}
            </div>
            <div className="p-4 border-t border-stone-100 dark:border-stone-700 text-xs text-stone-400 truncate">{user.email}</div>
          </aside>
          {sidebarOpen && <div className="fixed inset-0 bg-black/20 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}
        </>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top navbar - sticky */}
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm border-b border-stone-100 dark:border-stone-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {user && (
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 -ml-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg md:hidden">
                <svg className="w-5 h-5 dark:text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            {!user && <Logo size="small" />}
            {user && <span className="text-sm text-stone-600 dark:text-stone-400 hidden md:block">ThinkBack</span>}
          </div>
          {!user && (
            <button onClick={() => setShowAuth(true)} className="text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 transition">
              Sign in
            </button>
          )}
        </header>

        {/* Messages area - scrollable */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-4">
            {!hasStarted && (
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
                <p className="text-2xl text-stone-600 dark:text-stone-400 font-light">What are you trying to figure out?</p>
              </div>
            )}
            <div className="space-y-4">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] sm:max-w-[75%] px-4 py-3 rounded-2xl rounded-br-sm whitespace-pre-wrap bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-900 text-[15px]">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <Image src="/erwin.jpg" alt="" width={32} height={32} className="rounded-full" />
                    </div>
                    <div className="max-w-[85%] sm:max-w-[75%] px-4 py-3 rounded-2xl rounded-tl-sm whitespace-pre-wrap bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 text-[15px]">
                      {m.content}
                    </div>
                  </div>
                )
              )}
              {loading && (
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <Image src="/erwin.jpg" alt="" width={32} height={32} className="rounded-full" />
                  </div>
                  <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-4 py-3 rounded-2xl rounded-tl-sm">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-stone-300 dark:bg-stone-500 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-stone-300 dark:bg-stone-500 rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} />
                      <div className="w-2 h-2 bg-stone-300 dark:bg-stone-500 rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div ref={messagesEndRef} className="h-4" />
          </div>
        </div>

        {/* Input area - fixed at bottom */}
        <div className="border-t border-stone-100 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-3 safe-area-bottom">
          <form onSubmit={sendMessage} className="max-w-2xl mx-auto">
            <div className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage(e);
                    }
                  }}
                  placeholder={showAuth ? "Sign in to continue..." : hasStarted ? "Reply..." : "I want to understand..."}
                  disabled={loading || showAuth}
                  rows={1}
                  className="w-full px-4 py-3 pr-12 rounded-2xl border border-stone-200 dark:border-stone-700 focus:outline-none focus:border-stone-300 dark:focus:border-stone-600 focus:ring-1 focus:ring-stone-300 dark:focus:ring-stone-600 disabled:opacity-50 bg-stone-50 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500 resize-none text-[16px] leading-6"
                  style={{ minHeight: "48px", maxHeight: "120px" }}
                />
              </div>
              <button
                type="submit"
                disabled={loading || showAuth || !input.trim()}
                className="p-3 bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-900 rounded-full hover:bg-stone-700 dark:hover:bg-stone-200 disabled:opacity-40 disabled:hover:bg-stone-800 dark:disabled:hover:bg-stone-100 transition flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </button>
            </div>
            {!user && !hasStarted && (
              <p className="text-center text-xs text-stone-400 mt-2">{FREE_LIMIT - msgCount} free questions</p>
            )}
          </form>
        </div>
      </div>

      {/* Auth modal */}
      {showAuth && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-stone-800 rounded-2xl p-6 sm:p-8 max-w-md w-full relative">
            {msgCount < FREE_LIMIT && (
              <button onClick={() => { setShowAuth(false); setAuthStep("email"); setAuthError(""); }} className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            <div className="flex justify-center mb-6"><Logo size="small" /></div>
            <h2 className="text-xl font-medium mb-2 text-center dark:text-stone-100">{msgCount >= FREE_LIMIT ? "Keep thinking" : "Sign in"}</h2>
            <p className="text-stone-500 dark:text-stone-400 mb-6 text-sm text-center">
              {authStep === "email" ? "Enter your email to continue" : "Enter the 6-digit code we sent you"}
            </p>
            {authStep === "email" ? (
              <form onSubmit={sendCode} className="space-y-3">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-100 dark:placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-500 text-[16px]" required disabled={authLoading} />
                {authError && <p className="text-red-500 text-sm">{authError}</p>}
                <button type="submit" disabled={authLoading} className="w-full bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-900 py-3 rounded-xl hover:bg-stone-700 dark:hover:bg-stone-200 transition disabled:opacity-50 font-medium">
                  {authLoading ? "Sending..." : "Continue"}
                </button>
              </form>
            ) : (
              <form onSubmit={verifyCode} className="space-y-3">
                <input type="text" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-500 text-center text-2xl tracking-widest font-mono" required disabled={authLoading} />
                {authError && <p className="text-red-500 text-sm text-center">{authError}</p>}
                <button type="submit" disabled={authLoading || code.length !== 6} className="w-full bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-900 py-3 rounded-xl hover:bg-stone-700 dark:hover:bg-stone-200 transition disabled:opacity-50 font-medium">
                  {authLoading ? "Verifying..." : "Verify"}
                </button>
                <button type="button" onClick={() => { setAuthStep("email"); setCode(""); setAuthError(""); }} className="w-full text-stone-500 dark:text-stone-400 text-sm hover:text-stone-700 dark:hover:text-stone-300">
                  Use different email
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
