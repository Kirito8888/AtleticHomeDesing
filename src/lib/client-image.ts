/**
 * Reescala y vuelve a codificar una foto en el navegador: el JPEG nuevo no lleva EXIF (ni ubicación
 * ni modelo del móvil). Así lo que sube ya está limpio y pesa poco.
 */
export async function reencodeImage(file: Blob, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la foto"))), "image/jpeg", quality));
}
