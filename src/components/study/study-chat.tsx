"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";

interface Citation {
  n: number;
  title: string;
  page: number | null;
  score: number;
}
interface Msg {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  citations?: Citation[] | null;
}

export function StudyChat({ threads, aiEnabled }: { threads: Array<{ id: string; title: string | null }>; aiEnabled: boolean }) {
  const [threadId, setThreadId] = useState<string>("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);

  async function openThread(id: string) {
    setThreadId(id);
    if (!id) return setMessages([]);
    try {
      const t = await api<{ messages: Msg[] }>(`/api/ai/study/threads/${id}`);
      setMessages(t.messages);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (q.length < 2) return;
    setBusy(true);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "USER", content: q }]);
    setQuestion("");
    try {
      const r = await api<{ threadId: string; message: Msg }>("/api/ai/study/chat", { body: { question: q, threadId: threadId || undefined } });
      setThreadId(r.threadId);
      setMessages((m) => [...m, r.message]);
    } catch (err) {
      toast.error((err as Error).message);
      setQuestion(q);
      setMessages((m) => m.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      {threads.length ? (
        <Select aria-label="Conversación" value={threadId} onChange={(e) => openThread(e.target.value)}>
          <option value="">Nueva conversación</option>
          {threads.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title ?? "Sin título"}
            </option>
          ))}
        </Select>
      ) : null}

      <div className="grid min-h-48 content-start gap-3 rounded-lg border p-3" aria-live="polite">
        {messages.length ? (
          messages.map((m) => (
            <div key={m.id} className={cn("max-w-[90%] rounded-lg px-3 py-2 text-sm", m.role === "USER" ? "justify-self-end bg-primary text-primary-foreground" : "bg-muted")}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.citations?.length ? (
                <ol className="mt-2 grid gap-0.5 border-t pt-2 text-xs text-muted-foreground">
                  {m.citations.map((c) => (
                    <li key={c.n}>
                      [{c.n}] {c.title}
                      {c.page ? `, pág. ${c.page}` : ""} <span className="tabular-nums">({Math.round(c.score * 100)} %)</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Pregunta sobre tus apuntes. Las respuestas citan el fragmento de origen.</p>
        )}
        {busy ? <p className="text-sm text-muted-foreground">Pensando…</p> : null}
      </div>

      <form onSubmit={ask} className="flex items-end gap-2">
        <Textarea
          aria-label="Pregunta"
          placeholder="¿Qué diferencia hay entre glucólisis aeróbica y anaeróbica?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          className="min-h-11"
        />
        <Button type="submit" size="icon" className="size-11 shrink-0" aria-label="Enviar" disabled={!aiEnabled || busy}>
          <Send />
        </Button>
      </form>
    </div>
  );
}
