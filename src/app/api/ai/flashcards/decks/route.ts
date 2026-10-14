import { listDecks } from "@/lib/ai/flashcards";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

/** Mazos propios y compartidos conmigo, con total de tarjetas, cuántas tocan hoy y mi progreso personal. */
export const GET = route(async () => listDecks((await requireUser()).id));
