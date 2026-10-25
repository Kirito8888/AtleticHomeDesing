#!/bin/sh
# E2E contra :3100. Uso: e2e.sh <suite…> (p. ej. e2e:v110) o e2e.sh all (build + todas las suites).
cd "$(dirname "$0")/../.."
set -a; . ./.env.local; set +a
export BASE_URL=http://localhost:3100 SHOTS_DIR=/tmp/atlenza-shots
export CHROMIUM_PATH=${CHROMIUM_PATH:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}
if [ "$1" = all ]; then
  npm run -s build > /tmp/atlenza-build.log 2>&1 || { echo "BUILD FALLA (ver /tmp/atlenza-build.log)"; exit 1; }
  set -- e2e e2e:plan e2e:v14 e2e:v15 e2e:v16 e2e:v17 e2e:v18 e2e:v19 e2e:v110 e2e:salto e2e:v20a e2e:v20b e2e:v20c e2e:v20d e2e:v20e e2e:v21a e2e:v21b e2e:v21c e2e:v22a e2e:v22b e2e:v23a e2e:v23b e2e:v23c e2e:v23d e2e:v24a e2e:v24b e2e:v24c e2e:v25a e2e:v25b e2e:v25c e2e:v25d e2e:v25e e2e:v25f e2e:v25g e2e:v25h e2e:v25i e2e:v25j e2e:v25k e2e:security
fi
fail=0
for s in "$@"; do
  if [ "$s" = e2e:security ]; then sh scripts/dev/serve.sh false; else pgrep -f next-server >/dev/null || sh scripts/dev/serve.sh true; fi
  if npm run -s "$s" > "/tmp/atlenza-$s.log" 2>&1; then echo "OK $s"; else echo "FALLA $s"; tail -15 "/tmp/atlenza-$s.log"; fail=1; fi
  [ "$s" = e2e:security ] && sh scripts/dev/serve.sh true
done
exit $fail
