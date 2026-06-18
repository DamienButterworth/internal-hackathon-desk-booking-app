"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, X, Send, Loader2 } from "lucide-react";
import clsx from "clsx";

// Floating desk-booking assistant. Holds the conversation client-side and posts
// the full history to /api/chat, which runs the Claude tool-use loop. After any
// reply we refresh the route so booking changes the assistant made show up in
// the map / lists without a manual reload.

type ChatMessage = { role: "user" | "assistant"; content: string };

const GREETING =
  "Hi! I'm your Deskly assistant. I can book a desk, check what's free, or show and cancel your bookings. Try \"book me a standing desk near a window tomorrow\".";

export function ChatWidget() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Drop the local greeting; send only real turns.
        body: JSON.stringify({ messages: next.slice(1) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
        // Reflect any bookings the assistant created/cancelled.
        router.refresh();
      }
    } catch {
      setError("Couldn't reach the assistant. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        className="fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-brand text-white shadow-lg transition-transform hover:scale-105 hover:bg-brand-strong"
      >
        {open ? <X size={22} /> : <MessageSquare size={22} />}
      </button>

      {/* Panel */}
      {open && (
        <div className="card fixed bottom-24 right-5 z-50 flex h-[32rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden p-0 shadow-2xl">
          <header className="flex items-center gap-2.5 border-b border-line bg-ink px-4 py-3 text-white">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-brand font-bold">
              D
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Deskly assistant</p>
              <p className="text-[10px] text-white/60">Book desks in plain English</p>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={clsx(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={clsx(
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-brand text-white"
                      : "bg-surface text-ink",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-surface px-3 py-2 text-sm text-muted">
                  <Loader2 size={14} className="animate-spin" />
                  Thinking…
                </div>
              </div>
            )}
            {error && (
              <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-line px-3 py-3">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={loading}
              placeholder="Ask me to book a desk…"
              className="flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={send}
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-white transition-colors hover:bg-brand-strong disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
