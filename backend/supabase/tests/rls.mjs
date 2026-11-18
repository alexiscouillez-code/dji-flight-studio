import { PGlite } from "@electric-sql/pglite";
// RLS test: runs the real migration in embedded Postgres (PGlite) with stubbed Supabase auth/storage schemas.
// Usage: pnpm test:rls
import { readFileSync } from "fs";
import assert from "node:assert/strict";
const db = new PGlite();
const stub = `
create role anon; create role authenticated;
create schema auth; create schema storage;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public bool, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
`;
await db.exec(stub);
for (const f of ["20261117000000_init.sql", "20261118000000_revoke_trigger_functions.sql"]) await db.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8"));
await db.exec(`grant usage on schema public, auth to authenticated; grant all on all tables in schema public to authenticated; grant execute on all functions in schema auth to authenticated;`);
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
await db.exec(`insert into auth.users values ('${A}'), ('${B}');`);
const as = async (uid, sql) => {
  await db.exec(`reset role; select set_config('request.jwt.sub', '${uid}', false); set role authenticated;`);
  try { return await db.query(sql); } finally { await db.exec("reset role;"); }
};
const prof = await db.query("select count(*)::int n from public.profiles"); console.log("profiles auto-created:", prof.rows[0].n);
const P = "33333333-3333-4333-8333-333333333333";
await as(A, `insert into public.projects (id, owner_id, name, schema_version, drone_profile_id, data) values ('${P}', '${A}', 'A project', 1, 'dji-neo-2', '{"x":1}')`);
await as(A, `update public.projects set data='{"x":2}' where id='${P}'`);
const own = (await as(A, "select count(*)::int n from public.projects")).rows[0].n; console.log("A sees own:", own); assert.equal(own, 1);
const leak = (await as(B, "select count(*)::int n from public.projects")).rows[0].n; console.log("B sees A's:", leak); assert.equal(leak, 0);
console.log("A versions:", (await as(A, "select count(*)::int n from public.project_versions")).rows[0].n);
console.log("B versions:", (await as(B, "select count(*)::int n from public.project_versions")).rows[0].n);
const upd = await as(B, `update public.projects set name='hacked' where id='${P}'`); console.log("B update affected:", upd.affectedRows); assert.equal(upd.affectedRows, 0);
const del = await as(B, `delete from public.projects where id='${P}'`); console.log("B delete affected:", del.affectedRows); assert.equal(del.affectedRows, 0);
try { await as(B, `insert into public.projects (owner_id, name, schema_version, data) values ('${A}', 'spoof', 1, '{}')`); console.log("B spoof insert: ALLOWED (BAD)"); process.exitCode = 1; } catch (e) { console.log("B spoof insert rejected:", e.message.slice(0, 60)); }
try { await as(B, `insert into public.missions (project_id, owner_id, name, altitude_reference) values ('${P}', '${B}', 'm', 'agl')`); console.log("B mission on A's project: ALLOWED (BAD)"); process.exitCode = 1; } catch (e) { console.log("B mission on A project rejected:", e.message.slice(0, 60)); }
try { await as(A, `insert into public.projects (owner_id, name, schema_version, data) values ('${A}', '', 1, '{}')`); console.log("empty name ALLOWED (BAD)"); process.exitCode = 1; } catch (e) { console.log("empty name rejected:", e.message.slice(0, 60)); }

console.log(process.exitCode ? "RLS TEST FAILED" : "RLS TEST PASSED");
