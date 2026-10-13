// Sobe um Postgres WASM descartável (PGlite, PostgreSQL 18) com socket em 127.0.0.1:54329.
// SÓ PARA TESTES LOCAIS. Não é o Supabase e não é o mesmo Postgres (o projeto usa 17.x).
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
fs.writeFileSync(path.join(dir, '.server.pid'), String(process.pid));
const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port: 54329, host: '127.0.0.1' });
await server.start();
console.log('ready');
process.on('SIGTERM', async () => { await server.stop(); process.exit(0); });
setInterval(() => {}, 1 << 30);
