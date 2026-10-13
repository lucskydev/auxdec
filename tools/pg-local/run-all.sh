#!/bin/bash
# Roda a pilha completa (stub -> migrações -> testes) num banco descartável novo.
D="$(cd "$(dirname "$0")" && pwd)"; R="$(cd "$D/../.." && pwd)"; S="$R/supabase"
"$D/fresh.sh"
"$D/runset.sh" "$S/tests/local/00_stub_supabase.sql" \
  "$(ls "$S"/migrations/*.sql | tr '\n' ' ')" \
  "$(ls "$S"/tests/[0-9][0-9]_*.sql | tr '\n' ' ')"
