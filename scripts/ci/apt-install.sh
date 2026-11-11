#!/bin/sh
# Instala paquetes con apt reintentando: el DNS de los runners de GitHub falla de vez en cuando
# («Temporary failure resolving …ubuntu.com») y un solo fallo no debe tumbar toda la CI.
# Uso: sh scripts/ci/apt-install.sh paquete…
[ "$#" -gt 0 ] || { echo "uso: apt-install.sh paquete…" >&2; exit 2; }
for wait in 0 15 30 60; do
  [ "$wait" -gt 0 ] && { echo "apt falló; reintento en ${wait} s"; sleep "$wait"; }
  if sudo apt-get update -q -o Acquire::Retries=5 && sudo apt-get install -y -q -o Acquire::Retries=5 --no-install-recommends "$@"; then
    exit 0
  fi
done
echo "apt: no se pudo instalar $* tras 4 intentos" >&2
exit 1
