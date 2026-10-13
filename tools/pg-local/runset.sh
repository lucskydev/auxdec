#!/bin/bash
# Uso: runset.sh "<stub.sql>" "<mig1 mig2 ...>" "<teste1 teste2 ...>"
# Reinicia um Postgres WASM descartável (PGlite via socket) e roda tudo com o psql real.
D="$(cd "$(dirname "$0")" && pwd)"; H="$D"
PORT=54329
STUB="$1"; MIGS="$2"; TESTS="$3"
export PGSSLMODE=disable PGCONNECT_TIMEOUT=20
P="psql -h 127.0.0.1 -p $PORT -U postgres -d postgres -X -v ON_ERROR_STOP=1"

SNAP="
select 'tabela:'||c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','m','S') and c.relname not like 'v2\_%'
union all select 'rls:'||c.relname||':'||c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname not like 'v2\_%'
union all select 'policy:'||schemaname||'.'||tablename||'.'||policyname||':'||coalesce(qual,'')||':'||coalesce(with_check,'')||':'||cmd||':'||roles::text from pg_policies where policyname not like 'v2\_%'
union all select 'bucket:'||id||':'||public||':'||coalesce(file_size_limit::text,'')||':'||coalesce(allowed_mime_types::text,'') from storage.buckets where id not like 'v2\_%'
union all select 'funcao:'||p.proname||':'||coalesce(p.proacl::text,'') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname not like 'v2\_%'
union all select 'privilegios:'||c.relname||':'||coalesce(c.relacl::text,'') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname not like 'v2\_%'
union all select 'publication:'||pubname||'.'||schemaname||'.'||tablename from pg_publication_tables where tablename not like 'v2\_%'
order by 1"

echo "== setup"; $P -q -f "$STUB" 2>&1 | tail -3 || exit 2
$P -Atc "$SNAP" > $H/snap_before.txt
for m in $MIGS; do
  echo "== migração: $(basename $m)"
  $P -q -f "$m" 2>&1 | tail -5
  [ ${PIPESTATUS[0]} -eq 0 ] || { echo "FALHOU: $m"; exit 3; }
done
$P -Atc "$SNAP" > $H/snap_after.txt
if diff -q $H/snap_before.txt $H/snap_after.txt >/dev/null; then
  echo "PASS  objetos sem prefixo v2_ inalterados ($(wc -l < $H/snap_before.txt) itens comparados)"
else
  echo "FAIL  objetos sem prefixo v2_ foram alterados:"; diff $H/snap_before.txt $H/snap_after.txt
fi

echo "== testes (uma sessão psql, ON_ERROR_STOP)"
ARGS=""; for t in $TESTS; do ARGS="$ARGS -f $t"; done
if [ "$ONERR" = "0" ]; then P2="${P/ON_ERROR_STOP=1/ON_ERROR_STOP=0}"; else P2="$P"; fi
$P2 $ARGS > $H/tests_out.txt 2>&1
RC=$?
OK=$(grep -c "NOTICE:  ok" $H/tests_out.txt)
echo "asserções com 'ok' registradas: $OK"
grep -v "NOTICE:  ok" $H/tests_out.txt | grep -v "^$" | tail -${TAIL:-15}
echo "psql exit code: $RC"
exit $RC
