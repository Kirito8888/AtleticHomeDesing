"use client";

/** fetch JSON para componentes cliente: lanza Error con el mensaje de la API. */
export async function api<T = unknown>(url: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body || init.form ? "POST" : "GET"),
    headers: init.body ? { "content-type": "application/json" } : undefined,
    body: init.form ?? (init.body ? JSON.stringify(init.body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = Array.isArray(data?.details)
      ? `: ${data.details.map((d: { path: string; message: string }) => `${d.path} ${d.message}`).join(", ")}`
      : "";
    throw new Error((data?.error ?? `Error ${res.status}`) + details);
  }
  return data as T;
}
