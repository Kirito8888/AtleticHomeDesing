import "server-only";
import { cache } from "react";

import { auth } from "@/auth";

/**
 * Sesión de la petición en curso. `auth()` ejecuta el callback `jwt` (consulta de revocación: versión de sesión,
 * suspensión, usuario borrado) en cada llamada; `cache` la comparte dentro de un mismo render, así que la comprobación
 * sigue haciéndose, una vez por petición en vez de una por cada `requireUser`/`pageUser`.
 */
export const currentSession = cache(() => auth());
