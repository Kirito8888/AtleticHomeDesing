/** Lo único que ve la usuaria de un documento de estudio fallido; el detalle va al log del servidor. */
export const DOC_ERROR = "No se pudo procesar el documento. Vuelve a intentarlo o prueba con otro fichero.";

/** Tapa también las filas antiguas, que guardaban el mensaje interno. */
export const publicDocError = (error: string | null | undefined) => (error ? DOC_ERROR : null);
