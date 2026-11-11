import { randomInt } from "node:crypto";

/**
 * Sufijo único para los datos de un fichero de tests de integración (`ps-a-${t}@test.dev`).
 * No usar `Date.now()`: con cientos de ficheros en paralelo, dos pueden arrancar en el mismo milisegundo y el
 * `deleteMany({ email: { contains: `-${t}@test.dev` } })` de uno borraría los usuarios del otro (fallo intermitente en CI).
 */
export const testStamp = (): number => randomInt(1, 2 ** 47);
