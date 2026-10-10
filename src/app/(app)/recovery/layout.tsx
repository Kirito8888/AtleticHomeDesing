/** Atlenza · aviso fijo en todas las páginas de salud y recuperación (bienestar, no producto sanitario). */
export default function RecoveryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <p className="mt-8 border-t pt-3 text-xs text-muted-foreground" role="note">
        Información orientativa de bienestar y entrenamiento. Atlenza no es un producto sanitario: no diagnostica, no predice enfermedades ni sirve como método anticonceptivo. Ante cualquier duda de salud, consulta con un profesional.
      </p>
    </>
  );
}
