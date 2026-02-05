"use client";

import { useState, useEffect, useRef, FormEvent } from "react";

type Message = { role: "user" | "assistant"; content: string };
type AuthStep = "email" | "code" | "done";
type Conversation = { id: number; title: string; created_at: string };

const FREE_LIMIT = 10;

// Simple logo component
function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="w-8 h-8 bg-stone-800 rounded-lg flex items-center justify-center">
        <span className="text-white text-lg font-bold">?</span>
      </div>
      <span className="font-semibold text-stone-800 tracking-tight">ThinkBack</span>
    </div>
  );
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [msgCount, setMsgCount] = useState(0);

  // Intro state
  const [showIntro, setShowIntro] = useState(true);

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

  // Check if intro was seen
  useEffect(() => {
    if (localStorage.getItem("tb_intro_seen")) setShowIntro(false);
  }, []);

  // Check session and get server count on mount
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

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check if should show auth wall
  useEffect(() => {
    if (!user && msgCount >= FREE_LIMIT) setShowAuth(true);
  }, [msgCount, user]);

  const handleContinue = () => {
    localStorage.setItem("tb_intro_seen", "true");
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

        if (user && data.conversationId) {
          if (!currentConvId) {
            setCurrentConvId(data.conversationId);
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

  const loadConversation = async (convId: number) => {
    const res = await fetch(`/api/conversations/${convId}`);
    const data = await res.json();
    if (data.messages) {
      setMessages(data.messages);
      setCurrentConvId(convId);
      setSidebarOpen(false);
    }
  };

  const newConversation = () => {
    setMessages([]);
    setCurrentConvId(null);
    setSidebarOpen(false);
  };

  // Intro screen
  if (showIntro) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-stone-50 to-stone-100">
        <div className="max-w-md w-full text-center">
          <Logo className="justify-center mb-12" />

          <h1 className="text-3xl font-light text-stone-800 mb-4">
            Think deeper.
          </h1>

          <p className="text-stone-500 mb-8 leading-relaxed">
            Most AI gives you answers.<br />
            This one asks questions that help you find them yourself.
          </p>

          <button
            onClick={handleContinue}
            className="px-8 py-3 bg-stone-800 text-white rounded-full hover:bg-stone-700 transition font-medium"
          >
            Start thinking
          </button>

          <p className="text-stone-400 text-xs mt-8">
            Free to try. No account needed.
          </p>
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
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="fixed top-4 left-4 z-50 p-2 bg-white border border-stone-200 rounded-lg shadow-sm md:hidden"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <aside className={`fixed md:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-stone-100 transform transition-transform ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
            <div className="p-4 h-full flex flex-col">
              <Logo className="mb-6" />

              <button
                onClick={newConversation}
                className="w-full px-4 py-2.5 mb-4 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition text-sm font-medium"
              >
                + New conversation
              </button>

              <div className="flex-1 overflow-y-auto space-y-1">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => loadConversation(conv.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition ${
                      currentConvId === conv.id ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:bg-stone-50 hover:text-stone-700"
                    }`}
                  >
                    {conv.title}
                  </button>
                ))}
                {conversations.length === 0 && (
                  <p className="text-stone-400 text-xs text-center py-8">No conversations yet</p>
                )}
              </div>

              <div className="pt-4 border-t border-stone-100 text-xs text-stone-400 truncate">
                {user.email}
              </div>
            </div>
          </aside>

          {sidebarOpen && (
            <div className="fixed inset-0 bg-black/20 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
          )}
        </>
      )}

      <main className="flex-1 max-w-2xl mx-auto p-4 min-h-screen flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between py-3">
          {!user && <Logo />}
          {user && <div />}
          {!user && (
            <button
              onClick={() => setShowAuth(true)}
              className="text-sm text-stone-500 hover:text-stone-700 transition"
            >
              Sign in
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-4 pb-4">
          {!hasStarted && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
              <p className="text-2xl text-stone-600 font-light">What are you trying to figure out?</p>
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
                <div className="w-8 h-8 bg-stone-200 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-stone-600 text-sm font-medium">?</span>
                </div>
                <div className="max-w-[75%] px-4 py-3 rounded-2xl rounded-tl-sm whitespace-pre-wrap bg-white border border-stone-200 text-stone-700">
                  {m.content}
                </div>
              </div>
            )
          )}
          {loading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-stone-200 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-stone-600 text-sm font-medium">?</span>
              </div>
              <div className="bg-white border border-stone-200 px-4 py-3 rounded-2xl rounded-tl-sm text-stone-300">
                <span className="inline-flex gap-1">
                  <span className="animate-bounce">.</span>
                  <span className="animate-bounce" style={{ animationDelay: "0.1s" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "0.2s" }}>.</span>
                </span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Auth modal */}
        {showAuth && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full relative">
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

              <Logo className="justify-center mb-6" />

              <h2 className="text-xl font-medium mb-2 text-center">
                {msgCount >= FREE_LIMIT ? "Keep thinking" : "Sign in"}
              </h2>
              <p className="text-stone-500 mb-6 text-sm text-center">
                {authStep === "email" ? "Enter your email to continue" : "Enter the 6-digit code we sent you"}
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
                    className="w-full bg-stone-800 text-white py-3 rounded-xl hover:bg-stone-700 transition disabled:opacity-50 font-medium"
                  >
                    {authLoading ? "Sending..." : "Continue"}
                  </button>
                </form>
              ) : (
                <form onSubmit={verifyCode} className="space-y-3">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-300 text-center text-2xl tracking-widest font-mono"
                    required
                    disabled={authLoading}
                  />
                  {authError && <p className="text-red-500 text-sm text-center">{authError}</p>}
                  <button
                    type="submit"
                    disabled={authLoading || code.length !== 6}
                    className="w-full bg-stone-800 text-white py-3 rounded-xl hover:bg-stone-700 transition disabled:opacity-50 font-medium"
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
        <form onSubmit={sendMessage} className="bg-stone-50 pt-3 pb-safe">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-resize
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 150) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(e);
                }
              }}
              onFocus={() => {
                // Scroll to bottom when input is focused on mobile
                setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
              }}
              placeholder={showAuth ? "Sign in to continue..." : hasStarted ? "Continue..." : "I want to understand..."}
              disabled={loading || showAuth}
              rows={1}
              className="flex-1 px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-300 disabled:opacity-50 bg-white resize-none overflow-hidden"
              style={{ minHeight: "48px", maxHeight: "150px" }}
            />
            <button
              type="submit"
              disabled={loading || showAuth || !input.trim()}
              className="px-5 py-3 bg-stone-800 text-white rounded-xl hover:bg-stone-700 disabled:opacity-50 transition flex-shrink-0 h-12"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
          {!user && !hasStarted && (
            <p className="text-center text-xs text-stone-400 mt-3">
              {FREE_LIMIT - msgCount} free questions
            </p>
          )}
        </form>
      </main>
    </div>
  );
}
