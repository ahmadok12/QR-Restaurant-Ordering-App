// Automated test: optional waiter app, controlled by subscription (Super Admin) and switched on/off by Restaurant Admin
// Run with the server running:  node test_waiter_app_toggle.js
const http = require('http');

const BASE_URL = 'http://127.0.0.1:3000';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, raw: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

let passed = 0;
let failed = 0;
function assert(cond, desc) {
  if (cond) { console.log(`\x1b[32m✔ PASS:\x1b[0m ${desc}`); passed++; }
  else { console.log(`\x1b[31m✘ FAIL:\x1b[0m ${desc}`); failed++; }
}

const WAITER = { email: 'hamza@deragourmet.com', password: 'Waiter#101' };

async function run() {
  console.log('=== OPTIONAL WAITER APP (SUBSCRIPTION + ADMIN TOGGLE) TEST ===');

  const superLogin = await request('POST', '/api/auth/login', { email: 'superadmin@deragourmet.com', password: 'SuperAdmin#2026' });
  const superToken = superLogin.body.token;
  const adminLogin = await request('POST', '/api/auth/login', { email: 'owner@deragourmet.com', password: 'DeraAdmin#2026' });
  const adminToken = adminLogin.body.token;
  assert(!!superToken && !!adminToken, 'Super admin and restaurant admin can log in');

  // Start from a known state: included in plan + switched on
  await request('PUT', '/api/super/restaurants/REST-001', { features: { waiterApp: true } }, superToken);
  await request('POST', '/api/restaurant/modules', { waiterAppEnabled: true }, adminToken);

  const m0 = await request('GET', '/api/restaurant/modules?restaurantId=REST-001');
  assert(m0.body.waiterApp.active === true, 'Waiter app is active when in plan and switched on');
  const w0 = await request('POST', '/api/auth/login', WAITER);
  assert(w0.status === 200 && w0.body.ok, 'Waiter can log in while the app is on');

  // Restaurant admin switches it off
  const off = await request('POST', '/api/restaurant/modules', { waiterAppEnabled: false }, adminToken);
  assert(off.status === 200 && off.body.waiterApp.active === false, 'Restaurant admin can switch the waiter app off');
  const w1 = await request('POST', '/api/auth/login', WAITER);
  assert(w1.status === 403 && w1.body.waiterAppDisabled === true, 'Waiter login is blocked while the app is off');
  assert(/turned off/i.test(w1.body.error || ''), 'Waiter sees "turned off" message');

  const pub = await request('GET', '/api/public/info?restaurantId=REST-001');
  assert(pub.body.restaurant.modules.waiterApp.active === false, 'Public info reports the waiter app as off');

  // Orders go to the admin (not to a waiter) while it is off - even if the client tries to pick a waiter
  const table = '96';
  const dev = 'dev_toggle_host';
  await request('POST', '/api/test/reset-table', { table });
  await request('POST', '/api/table-session/join', { table, deviceId: dev, name: 'Test Host' });
  const order = await request('POST', '/api/broadcast', {
    type: 'NEW_ORDER',
    senderDeviceId: dev,
    order: {
      ticketId: '#TKT-TEST-9601', restaurantId: 'REST-001', table: `Table ${table}`, guest: 'Test Host',
      items: [{ title: 'Chicken Karahi', price: 1450, qty: 1 }], subtotal: 1450, total: 1450, status: 'New',
      assignedWaiterId: 'waiter-01', assignedWaiterName: 'Hamza Abbasi (Rank 1)'
    }
  });
  assert(order.status === 200 && order.body.order && order.body.order.assignedWaiterId === 'unassigned', 'New orders are not assigned to a waiter while the app is off');
  assert(/Waiter app off/.test(order.body.order.assignedWaiterName || ''), 'Order shows it went to the restaurant admin');

  // Service calls can be marked done by the admin
  await request('POST', '/api/broadcast', { type: 'SERVICE_BELL', table: `Table ${table}`, request: 'Water' });
  let db = await request('GET', '/api/db');
  const bell = (db.body.serviceBells || []).find(b => b.table === `Table ${table}`);
  assert(!!bell, 'Service call is stored for the admin Live screen');
  await request('POST', '/api/broadcast', { type: 'SERVICE_BELL_RESOLVED', bellId: bell && bell.id, table: `Table ${table}` }, adminToken);
  db = await request('GET', '/api/db');
  assert(!(db.body.serviceBells || []).some(b => b.id === (bell && bell.id)), 'Marking a service call done removes it');

  // Super admin removes it from the plan -> admin cannot switch it on
  const notInPlan = await request('PUT', '/api/super/restaurants/REST-001', { features: { waiterApp: false } }, superToken);
  assert(notInPlan.status === 200 && notInPlan.body.restaurant.features.waiterApp === false, 'Super admin can remove the waiter app from the plan');
  const tryOn = await request('POST', '/api/restaurant/modules', { waiterAppEnabled: true }, adminToken);
  assert(tryOn.status === 403 && tryOn.body.notInPlan === true, 'Restaurant admin cannot switch it on when it is not in the plan');
  const w2 = await request('POST', '/api/auth/login', WAITER);
  assert(w2.status === 403 && /subscription/i.test(w2.body.error || ''), 'Waiter sees "not included in subscription" message');

  // Only the super admin can change plan features
  const sneaky = await request('PUT', '/api/super/restaurants/REST-001', { features: { waiterApp: true } }, adminToken);
  assert(sneaky.status === 403, 'Restaurant admin cannot add the waiter app to their own plan');
  const anon = await request('POST', '/api/restaurant/modules', { waiterAppEnabled: true });
  assert(anon.status === 403, 'Changing modules without logging in is blocked');

  // Back in plan + switched on -> waiter can log in again
  await request('PUT', '/api/super/restaurants/REST-001', { features: { waiterApp: true } }, superToken);
  const on = await request('POST', '/api/restaurant/modules', { waiterAppEnabled: true }, adminToken);
  assert(on.status === 200 && on.body.waiterApp.active === true, 'Admin can switch it back on once it is in the plan');
  const w3 = await request('POST', '/api/auth/login', WAITER);
  assert(w3.status === 200 && w3.body.ok, 'Waiter can log in again');

  // The database file is never served to browsers
  const leak = await request('GET', '/data/pos_db.json');
  assert(leak.status === 403, 'The database file cannot be downloaded from the browser');
  const leak2 = await request('GET', '/server.js');
  assert(leak2.status === 403, 'Server code cannot be downloaded from the browser');

  await request('POST', '/api/test/reset-table', { table });

  console.log('\n========================================');
  console.log(`RESULTS: Passed: ${passed}, Failed: ${failed}`);
  console.log('========================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
