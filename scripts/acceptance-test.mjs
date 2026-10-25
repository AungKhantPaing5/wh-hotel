import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import sharp from 'sharp';
const authBase = process.env.AUTH_EMULATOR_URL || 'http://127.0.0.1:9099';
const base = process.env.TEST_API_URL || 'http://127.0.0.1:4000/v1';
if (process.env.APP_ENV !== 'local-test') throw new Error('Acceptance fixture writes require APP_ENV=local-test.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const password='WhTestOnly2026!';
async function login(email) {
  const r=await fetch(`${authBase}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
  const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data.idToken;
}
async function call(path,token,method='GET',body,key,status=200){
 const r=await fetch(`${base}/${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json();assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(data)}`);return data;
}
let owner, guest, staff, original, physical, originalStaff;
try{
 owner=await login('admin@wh.test');guest=await login('guest@wh.test');staff=await login('staff@wh.test');
 assert.equal((await call('admin/system',owner)).localTest,true,'Never run acceptance fixtures on a live backend.');
 // This is a disposable test database. Remove only previous acceptance stays for the seeded guest.
 await pool.query('DELETE FROM payment_transactions WHERE booking_id IN (SELECT id FROM bookings WHERE firebase_uid=$1)', ['wh-test-guest']);
 await pool.query('DELETE FROM audit_logs WHERE booking_id IN (SELECT id FROM bookings WHERE firebase_uid=$1)', ['wh-test-guest']);
 await pool.query('DELETE FROM bookings WHERE firebase_uid=$1', ['wh-test-guest']);
 const types=await call('admin/room-types',owner);original=types[0];physical=(await call('admin/rooms',owner)).filter(r=>r.room_type_id===original.id);
 originalStaff=(await call('admin/staff',owner)).find(r=>r.firebase_uid==='wh-test-staff');
 const today=new Date(Date.now()+390*60000+7*86400000).toISOString().slice(0,10);
 const out=new Date(Date.parse(`${today}T00:00:00Z`)+86400000).toISOString().slice(0,10);
 const body={roomTypeId:original.id,checkIn:today,checkOut:out,guests:1};
 await call('bookings',null,'GET',undefined,undefined,401);
 await call('admin/bookings',guest,'GET',undefined,undefined,403);
 await call('admin/system',staff,'GET',undefined,undefined,403);
 const unverified=await login('nophone@wh.test');
 await call('bookings',unverified,'POST',body,randomUUID(),403);
 console.log('PASS authentication, owner boundary and required-contact booking gate');
 // Self-reported contact data must be validated and scoped to the signed-in UID.
 await call('me/contact',null,'PATCH',{phone:'09123456789'},undefined,401);
 assert.equal((await call('me',unverified)).needsPhone,true);
 for(const phone of [null,12345678901,'08123456789','0912345678','091234567890','+959123456789','09abcdefghi',' 09123456789','09123456789\n']) {
   await call('me/contact',unverified,'PATCH',{phone},undefined,400);
 }
 await call('me/contact',unverified,'PATCH',{phone:'09123456789'});
 const contact=await call('me',unverified);
 assert.equal(contact.phone,'09123456789');assert.equal(contact.needsPhone,false);
 assert.notEqual((await call('me',guest)).phone, contact.phone);
 await pool.query('DELETE FROM customer_contacts WHERE firebase_uid=$1',[contact.uid]);
 console.log('PASS required phone format validation, authenticated persistence and UID isolation without SMS');

 // Physical room changes preserve existing allocation IDs and reject duplicates.
 await call('admin/rooms',guest,'POST',{roomTypeId:original.id,number:'acceptance-601'},undefined,403);
 const newRoom=await call('admin/rooms',owner,'POST',{roomTypeId:original.id,number:'acceptance-601'},undefined,201);
 await call(`admin/rooms/${newRoom.id}`,staff,'PATCH',{number:'acceptance-602'},undefined,403);
 await call(`admin/rooms/${newRoom.id}`,owner,'PATCH',{number:'acceptance-602'});
 assert.ok((await call('rooms')).find(type=>type.id===original.id).room_numbers.includes('acceptance-602'));
 await call(`admin/rooms/${newRoom.id}`,owner,'PATCH',{number:physical[0].number},undefined,400);
 await call('admin/rooms',owner,'POST',{roomTypeId:original.id,number:'acceptance-602'},undefined,400);
 await call(`admin/rooms/${newRoom.id}`,owner,'PATCH',{active:false});
 assert.ok(!(await call('rooms')).find(type=>type.id===original.id).room_numbers.includes('acceptance-602'));
 await pool.query('DELETE FROM rooms WHERE id=$1',[newRoom.id]);
 console.log('PASS physical room creation, renaming, duplicate rejection and public room numbers');
 const newTypeBody={name:'Acceptance Garden Room',description:'A room created by the hotel.',maxGuests:2,nightlyAmountMinor:'7500000',amenities:['Wi-Fi'],photoUrls:[],roomNumbers:['acceptance-501','acceptance-502']};
 await call('admin/room-types',guest,'POST',newTypeBody,undefined,403);
 await call('admin/room-types',staff,'POST',newTypeBody,undefined,403);
 await call('admin/room-types',owner,'POST',{...newTypeBody,maxGuests:0},undefined,400);
 const createdType=await call('admin/room-types',owner,'POST',newTypeBody,undefined,201);
 assert.equal((await pool.query('SELECT count(*)::integer AS count FROM rooms WHERE room_type_id=$1',[createdType.id])).rows[0].count,2);
 const countBefore=(await call('admin/room-types',owner)).length;
 await call('admin/room-types',owner,'POST',newTypeBody,undefined,400);
 assert.equal((await call('admin/room-types',owner)).length,countBefore,'Duplicate inventory must roll back the new category.');
 await pool.query('DELETE FROM rooms WHERE room_type_id=$1',[createdType.id]);
 await pool.query('DELETE FROM room_types WHERE id=$1',[createdType.id]);
 await call('admin/staff',staff,'POST',{email:'guest@wh.test',permissions:['rooms.manage']},undefined,403);
 await call('admin/staff',owner,'POST',{email:'missing@wh.test',permissions:[]},undefined,404);
 await call('admin/staff',owner,'POST',{email:'admin@wh.test',permissions:[]},undefined,400);
 console.log('PASS room-type creation with inventory, duplicate rollback and email-based staff authorization');
 await call('admin/staff',owner,'POST',{email:'staff@wh.test',permissions:['bookings.read','payments.read']},undefined,201);
 await call('admin/bookings',staff);await call('admin/payments',staff);
 await call(`admin/room-types/${original.id}`,staff,'PATCH',{},undefined,403);
 const edit={name:original.name,description:original.description,maxGuests:original.max_guests,nightlyAmountMinor:'9900000',amenities:original.amenities,photoUrls:[]};
 await call(`admin/room-types/${original.id}`,owner,'PATCH',edit);
 assert.equal(String((await call('rooms')).find(r=>r.id===original.id).nightly_amount_minor),'9900000');
 console.log('PASS owner room editing and read-only staff permissions');
 const image = await sharp({create:{width:16,height:16,channels:3,background:"#174b3f"}}).png().toBuffer();
 await call(`admin/room-types/${original.id}/photos`,guest,'POST',{data:image.toString('base64')},undefined,403);
 await call(`admin/room-types/${original.id}/photos`,staff,'POST',{data:image.toString('base64')},undefined,403);
 await call(`admin/room-types/${original.id}/photos`,owner,'POST',{data:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64')},undefined,400);
 const photo = await call(`admin/room-types/${original.id}/photos`,owner,'POST',{data:image.toString('base64')},undefined,201);
 const duplicate = await call(`admin/room-types/${original.id}/photos`,owner,'POST',{data:image.toString('base64')},undefined,201);
 assert.equal(photo.url,duplicate.url);
 assert.match(photo.url,/^\/api\/photos\/[a-f0-9]{64}\.webp$/);
 const publicPhoto=await fetch(`${base}/photos/${photo.url.split('/').pop()}`);
 assert.equal(publicPhoto.status,200);assert.match(publicPhoto.headers.get('content-type'),/image\/webp/);
 assert.equal((await call('rooms')).find(r=>r.id===original.id).photo_urls.length,1);
 await call(`admin/room-types/${original.id}`,owner,'PATCH',{...edit,photoUrls:[photo.url]});
 console.log('PASS room photo upload, format validation, authorization, deduplication and public serving');

 for(const room of physical)await call(`admin/rooms/${room.id}`,owner,'PATCH',{active:false});
 assert.equal((await call(`availability?checkIn=${today}&checkOut=${out}`)).find(r=>r.id===original.id).available_rooms,0);
 await call('bookings',guest,'POST',body,randomUUID(),409);
 for(const room of physical)await call(`admin/rooms/${room.id}`,owner,'PATCH',{active:true});
 console.log('PASS offline inventory and sold-out rejection');
 const key=randomUUID();
 const first=await call('bookings',guest,'POST',body,key,201);
 const retry=await call('bookings',guest,'POST',body,key,201);
 assert.equal(first.id,retry.id);assert.equal(String(first.total_amount_minor),'9900000');
 await call('bookings',guest,'POST',{...body,guests:2},key,409);
 await call(`admin/bookings/${first.id}`,staff,'PATCH',{action:'accept'},undefined,403);
 await call(`local-test/bookings/${first.id}/pay`,guest,'POST',undefined,undefined,409);
 await call(`admin/bookings/${first.id}`,owner,'PATCH',{action:'accept'});
 const paid=await call(`local-test/bookings/${first.id}/pay`,guest,'POST',undefined,undefined,201);
 const paidAgain=await call(`local-test/bookings/${first.id}/pay`,guest,'POST',undefined,undefined,201);
 assert.equal(paid.booking.status,'CONFIRMED');assert.equal(paid.simulated,true);assert.equal(paid.payment.id,paidAgain.payment.id);
 assert.equal((await call('admin/payments',staff)).filter(p=>p.booking_id===first.id).length,1);
 console.log('PASS retry idempotency, server price, approval, simulated payment and payment retry');
 const second=await call('bookings',guest,'POST',body,randomUUID(),201);
 await call(`admin/bookings/${second.id}`,owner,'PATCH',{action:'reject'});
 assert.equal((await call('bookings',guest)).find(b=>b.id===second.id).status,'REJECTED');
 await call('admin/staff/wh-test-staff',owner,'DELETE');
 await call('admin/bookings',staff,'GET',undefined,undefined,403);
 console.log('PASS booking rejection and immediate staff access revocation');
 // Exercise concurrent requests through the real HTTP/controller/DB path.
 const requests=await Promise.all(Array.from({length:3},async()=>{
  const r=await fetch(`${base}/bookings`,{method:'POST',headers:{Authorization:`Bearer ${guest}`,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify(body)});return r.status;
 }));
 assert.equal(requests.filter(s=>s===201).length,1);assert.equal(requests.filter(s=>s===409).length,2);
 console.log('PASS concurrent booking race: one remaining room creates one reservation');
 console.log('ACCEPTANCE PASSED. No real SMS, provider login or money was tested.');
}finally{
 // Leave the visible demo accounts and inventory clean for the owner to test manually.
 if(owner&&original){
  await call(`admin/room-types/${original.id}`,owner,'PATCH',{name:original.name,description:original.description,maxGuests:original.max_guests,nightlyAmountMinor:String(original.nightly_amount_minor),amenities:original.amenities,photoUrls:original.photo_urls});
  for(const room of physical||[])await call(`admin/rooms/${room.id}`,owner,'PATCH',{active:room.active});
  if(originalStaff)await call('admin/staff',owner,'POST',{email:originalStaff.email,permissions:originalStaff.permissions},undefined,201);
  else await call('admin/staff/wh-test-staff',owner,'DELETE');
  await pool.query('DELETE FROM payment_transactions WHERE booking_id IN (SELECT id FROM bookings WHERE firebase_uid=$1)', ['wh-test-guest']);
  await pool.query('DELETE FROM audit_logs WHERE booking_id IN (SELECT id FROM bookings WHERE firebase_uid=$1)', ['wh-test-guest']);
  await pool.query('DELETE FROM bookings WHERE firebase_uid=$1', ['wh-test-guest']);
 }
 await pool.end();
}
