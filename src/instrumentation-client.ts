// Zod 4 comprueba con `Function("")` si puede compilar validadores; con la CSP de
// producción (sin 'unsafe-eval') eso registra una violación en cada página. Se
// desactiva la compilación en el navegador antes de que se cargue ningún esquema
// (la config de zod vive en globalThis). La CSP no se toca.
const g = globalThis as { __zod_globalConfig?: { jitless?: boolean } };
g.__zod_globalConfig = { ...g.__zod_globalConfig, jitless: true };

export {};
