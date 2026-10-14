# Actividades reales anonimizadas (v1.10)

Aquí van ficheros reales de relojes (FIT, GPX o TCX) **ya anonimizados**, para que los tests usen datos
de verdad sin publicar nada personal (el repositorio es público).

```bash
npx tsx scripts/anonymize-activity.mts mi-actividad.fit otra.gpx --out e2e/fixtures/real
# --keep-shape conserva la forma del recorrido, trasladada a un punto neutro del Atlántico
```

El script escribe `<nombre>.anon.tcx` con:
- las fechas desplazadas a enero de 2020 (se conserva la hora del día);
- sin GPS (o con la forma trasladada si usas `--keep-shape`);
- sin marca, modelo ni número de serie del dispositivo.

**Ábrelo y revísalo antes de hacer commit.** `src/lib/training/anonymize.test.ts` lee todo lo que haya aquí y
comprueba que se importa con valores razonables, en 2020 y sin GPS real.
