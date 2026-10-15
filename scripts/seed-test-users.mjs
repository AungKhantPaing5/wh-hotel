const base = process.env.AUTH_EMULATOR_URL || 'http://127.0.0.1:9099';
// This endpoint exists only in the Firebase Auth emulator, never the live identity API.
const users = [
  { localId: 'wh-test-admin', email: 'admin@wh.test', phoneNumber: '+959770000001', displayName: 'WH Test Owner' },
  { localId: 'wh-test-guest', email: 'guest@wh.test', phoneNumber: '+959770000002', displayName: 'WH Test Guest' },
  { localId: 'wh-test-staff', email: 'staff@wh.test', phoneNumber: '+959770000003', displayName: 'WH Test Staff' },
  { localId: 'wh-test-no-phone', email: 'nophone@wh.test', displayName: 'WH Unverified Guest' },
];
for (const user of users) {
  const response = await fetch(`${base}/identitytoolkit.googleapis.com/v1/projects/demo-wh-final/accounts`, {
    method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...user, emailVerified: true, password: 'WhTestOnly2026!', }),
  });
  if (!response.ok) {
    const result = await response.json();
    if (!['EMAIL_EXISTS', 'DUPLICATE_LOCAL_ID', 'PHONE_NUMBER_EXISTS'].includes(result.error?.message)) throw new Error(JSON.stringify(result));
  }
}
console.log('Disposable local test accounts ready. Password: WhTestOnly2026!');
