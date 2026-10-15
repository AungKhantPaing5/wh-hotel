import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

test('PostgreSQL blocks overlapping active stays but accepts adjacent stays and released inventory', { skip: !process.env.DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const type = (await client.query("INSERT INTO room_types(name,description,max_guests,nightly_amount_minor) VALUES('Test','Test',2,100) RETURNING id")).rows[0];
    const room = (await client.query('INSERT INTO rooms(room_type_id,number) VALUES($1,$2) RETURNING id', [type.id, randomUUID()])).rows[0];
    const add = (a:string,b:string,status='CONFIRMED') => client.query(`INSERT INTO bookings
      (id,firebase_uid,room_id,check_in,check_out,guests,total_amount_minor,currency,status,idempotency_key,request_fingerprint)
      VALUES($1,'test',$2,$3,$4,1,100,'MMK',$5,$6,'test')`,[randomUUID(),room.id,a,b,status,randomUUID()]);
    await add('2099-01-01','2099-01-03');
    await client.query('SAVEPOINT overlap');
    await assert.rejects(add('2099-01-02','2099-01-04'), (error:unknown)=>(error as {code:string}).code==='23P01');
    await client.query('ROLLBACK TO SAVEPOINT overlap');
    await add('2099-01-03','2099-01-04');
    await add('2099-01-01','2099-01-03','EXPIRED');
  } finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
});
