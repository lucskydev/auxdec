#!/bin/bash
# Reinicia o Postgres WASM descartável com banco VAZIO. Uso: tools/pg-local/fresh.sh
D="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$D/.server.pid" ]; then kill "$(cat "$D/.server.pid")" 2>/dev/null; rm -f "$D/.server.pid"; fi
sleep 2
cd "$D"
setsid nohup node server.mjs > "$D/.server.log" 2>&1 < /dev/null &
for i in $(seq 1 40); do grep -q ready "$D/.server.log" 2>/dev/null && break; sleep 1; done
sleep 1
