#!/usr/bin/env bash
# PostgreSQL local aislado para desarrollo y pruebas de AyniSafe API.
# Clúster propio en apps/api/.pgdata, puerto 5433, solo 127.0.0.1. No toca otros
# servidores PostgreSQL de la maquina.
# Uso: bash scripts/bd-local.sh init | start | stop | status
set -euo pipefail
cd "$(dirname "$0")/.."

PUERTO=5433
BIN="${PG_BIN:-$(dirname "$(command -v psql)")}"
export PATH="$BIN:$PATH"

case "${1:-}" in
  init)
    [ -d .pgdata ] && { echo "Ya existe .pgdata; usa start."; exit 1; }
    [ -f .env ] && { echo "Ya existe .env; no se sobrescribe."; exit 1; }
    PW="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
    HMAC="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
    PWF="$(mktemp)"; printf '%s' "$PW" > "$PWF"
    initdb -D .pgdata -U ayni --auth=scram-sha-256 --pwfile="$PWF" -E UTF8 --locale=C > /dev/null
    rm -f "$PWF"
    # Arranque desacoplado (sin -w) para no heredar la salida de la terminal.
    nohup pg_ctl -D .pgdata -o "-p $PUERTO -c listen_addresses=127.0.0.1" \
      -l .pgdata/servidor.log start > /dev/null 2>&1 < /dev/null &
    for _ in $(seq 1 30); do pg_isready -h 127.0.0.1 -p "$PUERTO" -q && break; sleep 1; done
    export PGPASSWORD="$PW"
    createdb -h 127.0.0.1 -p "$PUERTO" -U ayni ayni_safe_dev
    createdb -h 127.0.0.1 -p "$PUERTO" -U ayni ayni_safe_test
    cat > .env <<ENV
NODE_ENV=development
PORT=3000
TRUST_PROXY_HOPS=0
RATE_LIMIT_HMAC_SECRET=${HMAC}
DATABASE_URL=postgresql://ayni:${PW}@127.0.0.1:${PUERTO}/ayni_safe_dev
TEST_DATABASE_URL=postgresql://ayni:${PW}@127.0.0.1:${PUERTO}/ayni_safe_test
ENV
    echo "Clúster creado en .pgdata (puerto $PUERTO). Credenciales guardadas en .env (no versionado)."
    ;;
  start)
    nohup pg_ctl -D .pgdata -o "-p $PUERTO -c listen_addresses=127.0.0.1" \
      -l .pgdata/servidor.log start > /dev/null 2>&1 < /dev/null &
    for _ in $(seq 1 30); do pg_isready -h 127.0.0.1 -p "$PUERTO" -q && break; sleep 1; done
    pg_isready -h 127.0.0.1 -p "$PUERTO"
    ;;
  stop)   pg_ctl -D .pgdata stop -m fast ;;
  status) pg_isready -h 127.0.0.1 -p "$PUERTO" ;;
  *) echo "Uso: bash scripts/bd-local.sh init|start|stop|status"; exit 2 ;;
esac
