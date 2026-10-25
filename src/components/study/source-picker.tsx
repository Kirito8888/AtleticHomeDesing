"use client";

import { useState } from "react";

import { Chips, Field } from "@/components/form/chips";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export type SourceKind = "document" | "topic" | "text";
export type SourceValue = { kind: "document"; documentId: string } | { kind: "topic"; topic: string } | { kind: "text"; text: string };

/** Origen del estudio: un apunte, un tema (se busca en los apuntes) o texto pegado. `idPrefix` fija los `id` de los campos. */
export function useSource(docs: Array<{ id: string; title: string }>) {
  const [kind, setKind] = useState<SourceKind>(docs.length ? "document" : "text");
  const [documentId, setDocumentId] = useState(docs[0]?.id ?? "");
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const ready = kind === "document" ? Boolean(documentId) : kind === "topic" ? topic.trim().length >= 2 : text.trim().length >= 40;
  const source: SourceValue = kind === "document" ? { kind, documentId } : kind === "topic" ? { kind, topic: topic.trim() } : { kind, text: text.trim() };
  return { kind, setKind, documentId, setDocumentId, topic, setTopic, text, setText, ready, source };
}

export function SourcePicker({ docs, idPrefix, s }: { docs: Array<{ id: string; title: string }>; idPrefix: string; s: ReturnType<typeof useSource> }) {
  return (
    <>
      <Field label="A partir de">
        <Chips
          label="Origen"
          value={s.kind}
          onChange={(v) => v && s.setKind(v)}
          options={[
            { value: "document", label: "Un apunte" },
            { value: "topic", label: "Un tema" },
            { value: "text", label: "Texto" },
          ]}
        />
      </Field>
      {s.kind === "document" ? (
        docs.length ? (
          <Field label="Apunte" htmlFor={`${idPrefix}-doc`}>
            <Select id={`${idPrefix}-doc`} value={s.documentId} onChange={(e) => s.setDocumentId(e.target.value)}>
              {docs.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </Select>
          </Field>
        ) : (
          <p className="text-sm text-muted-foreground">Aún no tienes apuntes listos: sube uno en Apuntes o pega un texto.</p>
        )
      ) : s.kind === "topic" ? (
        <Field label="Tema (se busca en tus apuntes)" htmlFor={`${idPrefix}-topic`}>
          <Input id={`${idPrefix}-topic`} value={s.topic} onChange={(e) => s.setTopic(e.target.value)} placeholder="Glucólisis" />
        </Field>
      ) : (
        <Field label="Pega tus apuntes (mín. 40 caracteres)" htmlFor={`${idPrefix}-text`}>
          <Textarea id={`${idPrefix}-text`} value={s.text} onChange={(e) => s.setText(e.target.value)} className="min-h-32" />
        </Field>
      )}
    </>
  );
}
