#!/bin/sh
# Crea .env.local de desarrollo con claves aleatorias si no existe (nunca se sube: está en .gitignore).
cd "$(dirname "$0")/../.."
[ -f .env.local ] && exit 0
r() { openssl rand -base64 32; }
cat > .env.local <<EOT
DATABASE_URL=postgresql://lifeos:lifeos@127.0.0.1:5432/lifeos?schema=public
AUTH_SECRET=$(r)
AUTH_URL=http://localhost:3100
TOTP_ENCRYPTION_KEY=$(r)
DATA_ENCRYPTION_KEY=$(r)
OFF_USER_AGENT="Atlenza-dev/1.10 (dev@example.com)"
UPLOAD_DIR=./uploads
EOT
echo ".env.local creado"
