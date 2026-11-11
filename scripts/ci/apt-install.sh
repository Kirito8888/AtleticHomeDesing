#!/bin/sh
# Instala paquetes con apt reintentando: el DNS de los runners de GitHub falla de vez en cuando
# («Temporary failure resolving …ubuntu.com»). Si es un corte puntual, el reintento lo salva; si es un corte largo,
# falla pronto (tiempos de espera cortos) en vez de colgar el job durante una hora.
# Uso: sh scripts/ci/apt-install.sh paquete…
[ "$#" -gt 0 ] || { echo "uso: apt-install.sh paquete…" >&2; exit 2; }
OPTS="-o Acquire::Retries=2 -o Acquire::http::Timeout=15 -o Acquire::https::Timeout=15"
for wait in 0 20 40; do
  [ "$wait" -gt 0 ] && { echo "apt falló; reintento en ${wait} s"; sleep "$wait"; }
  # shellcheck disable=SC2086
  if sudo apt-get update -q $OPTS && sudo apt-get install -y -q $OPTS --no-install-recommends "$@"; then
    exit 0
  fi
done
echo "apt: no se pudo instalar $* tras 3 intentos (¿corte de red del runner? vuelve a lanzar el job)" >&2
exit 1
