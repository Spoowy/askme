"use client";

import { useState, useEffect, useRef, FormEvent } from "react";

type Message = { role: "user" | "assistant"; content: string };

const FREE_LIMIT = 10;

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [msgCount, setMsgCount] = useState(0);
  const [email, setEmail] = useState("");
  const [registered, setRegistered] = useState(false);
  const [showWall, setShowWall] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Load state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("aq_state");
    if (saved) {
      const { count, reg } = JSON.parse(saved);
      setMsgCount(count || 0);
      setRegistered(reg || false);
    }
  }, []);

  // Save state to localStorage
  useEffect(() => {
    localStorage.setItem("aq_state", JSON.stringify({ count: msgCount, reg: registered }));
  }, [msgCount, registered]);

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check if should show wall
  useEffect(() => {
    if (msgCount >= FREE_LIMIT && !registered) setShowWall(true);
    else setShowWall(false);
  }, [msgCount, registered]);

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading || showWall) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages([...newMessages, { role: "assistant", content: data.message }]);
        setMsgCount((c) => c + 1);
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    // In production, you'd send this to your backend
    console.log("Registered:", email);
    setRegistered(true);
    setShowWall(false);
  };

  return (
    <main className="max-w-2xl mx-auto p-4 min-h-screen flex flex-col">
      {/* Header */}
      <header className="text-center py-8 border-b border-stone-200 mb-4">
        <h1 className="text-3xl font-light tracking-tight mb-2">Ask Questions</h1>
        <p className="text-stone-500 text-sm">An AI that only responds with questions to help you think deeper</p>
      </header>

      {/* Messages */}
      <div className="flex-1 space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="text-center text-stone-400 py-12">
            <p className="mb-2">What&apos;s on your mind?</p>
            <p className="text-xs">I won&apos;t give you answers — only questions that help you find them yourself.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                m.role === "user" ? "bg-stone-800 text-white" : "bg-white border border-stone-200 text-stone-700"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-stone-200 px-4 py-3 rounded-2xl text-stone-400">Thinking...</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Email wall */}
      {showWall && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
            <h2 className="text-xl font-medium mb-2">You&apos;ve used your free messages</h2>
            <p className="text-stone-500 mb-6 text-sm">Enter your email to continue the conversation</p>
            <form onSubmit={handleRegister} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-300"
                required
              />
              <button
                type="submit"
                className="w-full bg-stone-800 text-white py-3 rounded-xl hover:bg-stone-700 transition"
              >
                Continue
              </button>
            </form>
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
            placeholder={showWall ? "Enter email to continue..." : "Ask anything..."}
            disabled={loading || showWall}
            className="flex-1 px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-300 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || showWall || !input.trim()}
            className="px-6 py-3 bg-stone-800 text-white rounded-xl hover:bg-stone-700 disabled:opacity-50 transition"
          >
            Send
          </button>
        </div>
        {!registered && (
          <p className="text-center text-xs text-stone-400 mt-2">
            {FREE_LIMIT - msgCount > 0 ? `${FREE_LIMIT - msgCount} free messages remaining` : "Sign up to continue"}
          </p>
        )}
      </form>
    </main>
  );
}
