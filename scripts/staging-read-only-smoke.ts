import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { query, withTransaction, db } from '../lib/db';

async function main() {
  const url = new URL(process.env.DATABASE_URL || '');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '55439');
  assert.equal(url.pathname, '/magnets_staging_test');
  process.env.MAGNETS_DATABASE_READ_ONLY = '1';
  const setup = new Pool({connectionString:url.toString(),max:1});
  const table = 'read_only_smoke_' + randomUUID().replaceAll('-', '');
  try {
    await setup.query(`create table ${table} (id integer primary key, value text)`);
    await setup.query(`insert into ${table} values (1, 'original')`);
    const rejected = (error:unknown) => (error as {code?:string}).code === '25006';
    assert.equal((await query("select current_setting('transaction_read_only') as value")).rows[0].value, 'on');
    await assert.rejects(query(`update ${table} set value='changed' where id=1`), rejected);
    await assert.rejects(query(`with changed as (delete from ${table} returning *) select * from changed`), rejected);
    await assert.rejects(withTransaction(client => client.query(`insert into ${table} values (2,'changed')`)), rejected);
    assert.throws(db, /Direct ORM access is disabled/);
    assert.deepEqual((await setup.query(`select * from ${table}`)).rows,[{id:1,value:'original'}]);
    assert.equal((await query("select current_setting('transaction_read_only') as value")).rows[0].value, 'on', 'Pool recovery retains read-only transactions');
    delete process.env.MAGNETS_DATABASE_READ_ONLY;
    process.env.MAGNETS_STAGING_PREVIEW = '1';
    await assert.rejects(query(`delete from ${table}`), rejected, 'Preview mode enforces read-only even without the extra flag');
    console.log('PASS: read-only queries, transactions, CTE writes, ORM guard, rollback recovery, and preview fail-safe. Local test data unchanged.');
  } finally {
    await setup.query(`drop table if exists ${table}`);
    await setup.end();
    await globalThis.magnetsPgPool?.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
