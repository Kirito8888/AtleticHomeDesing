#!/bin/sh
# PostgreSQL 16 + pgvector de desarrollo en /tmp/lifeos-pg (contenedor de Claude Code o Linux con
# postgresql-16). Crea el rol y la BD «lifeos» (contraseña «lifeos», solo local) si no existen.
set -e
PGBIN=/usr/lib/postgresql/16/bin
D=/tmp/lifeos-pg
pg_isready -q -h $D 2>/dev/null && exit 0
if [ ! -s $D/data/PG_VERSION ]; then
  mkdir -p $D && chown postgres $D
  su postgres -c "$PGBIN/initdb -D $D/data -U postgres --auth=trust" >/dev/null
fi
rm -f $D/.s.PGSQL.5432.lock $D/.s.PGSQL.5432
su postgres -c "$PGBIN/pg_ctl -D $D/data -l $D/log -w start -o '-k $D -c listen_addresses=127.0.0.1'" >/dev/null
P="psql -h $D -U postgres -qtA"
$P -c "select 1 from pg_roles where rolname='lifeos'" | grep -q 1 \
  || $P -c "create role lifeos login superuser password 'lifeos'" -c "create database lifeos owner lifeos"
echo "Postgres listo en 127.0.0.1:5432"
