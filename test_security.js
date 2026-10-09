// Automated Test Suite: access control, secret handling and input hardening
const http = require('http');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const postData = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } : {}),
        ...headers
      }
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, data: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

const bearer = token => ({ 'Authorization': `Bearer ${token}` });
const { tableToken } = require('./test_utils');

async function runTests() {
  console.log('=== SECURITY HARDENING TESTS ===\n');
  let passed = 0;
  let failed = 0;
  function assert(desc, condition, detail = '') {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc} ${detail}`);
      failed++;
    }
  }

  try {
    // 1. Static file serving only exposes the app pages
    console.log('--- 1. Static files ---');
    assert('Database file is not downloadable', (await request('GET', '/data/pos_db.json')).status === 404);
    assert('Path traversal to the database is blocked', (await request('GET', '/..%2Fdata%2Fpos_db.json')).status === 404);
    assert('Server source is not downloadable', (await request('GET', '/server.js')).status === 404);
    assert('Test files are not downloadable', (await request('GET', '/test_security.js')).status === 404);
    assert('Customer page is still served', (await request('GET', '/index.html')).status === 200);
    assert('Root serves the hub page', (await request('GET', '/')).status === 200);

    // 2. Anonymous writes are rejected
    console.log('\n--- 2. Anonymous admin calls ---');
    const anonChecks = [
      ['GET', '/api/super/restaurants', null],
      ['POST', '/api/super/restaurants', { name: 'Hacked', email: 'x@x.com', password: 'p' }],
      ['PUT', '/api/super/restaurants/REST-001', { name: 'Hacked' }],
      ['GET', '/api/staff', null],
      ['POST', '/api/staff', { name: 'Evil', role: 'cashier', email: 'evil@x.com', password: 'evil' }],
      ['PUT', '/api/staff/waiter-01', { password: 'owned' }],
      ['DELETE', '/api/staff/waiter-01', null],
      ['POST', '/api/menu', { title: 'Free', price: 1 }],
      ['PUT', '/api/menu/dish-1', { price: 1 }],
      ['DELETE', '/api/menu/dish-1', null],
      ['POST', '/api/restaurant/billing-settings', { billingCharges: [] }],
      ['POST', '/api/restaurant/theme', { primaryColor: '#000000' }],
      ['POST', '/api/categories', { name: 'x' }],
      ['POST', '/api/sides', { name: 'x' }],
      ['POST', '/api/tags', { name: 'x' }],
      ['POST', '/api/extras', { name: 'x' }],
      ['POST', '/api/waiter-services', { name: 'x' }],
      ['POST', '/api/waiter-ranks', { name: 'x' }],
      ['POST', '/api/test/reset-table', { table: '04' }],
      ['GET', '/api/db', null],
      ['GET', '/api/tables', null]
    ];
    for (const [method, path, body] of anonChecks) {
      const r = await request(method, path, body);
      assert(`Anonymous ${method} ${path} is rejected (401)`, r.status === 401, `got ${r.status}`);
    }

    // 3. Logins never return secrets
    console.log('\n--- 3. Login responses ---');
    const adminLogin = await request('POST', '/api/auth/login', { email: 'owner@deragourmet.com', password: 'DeraAdmin#2026' });
    assert('Restaurant admin login succeeds', adminLogin.status === 200 && !!adminLogin.data.token);
    assert('Admin login hides the restaurant password and PIN',
      adminLogin.data.restaurant && !adminLogin.data.restaurant.managerPin && adminLogin.data.restaurant.credentials.password === undefined);
    const adminToken = adminLogin.data.token;

    const waiterLogin = await request('POST', '/api/auth/login', { email: 'hamza@deragourmet.com', password: 'Waiter#101' });
    assert('Waiter login succeeds', waiterLogin.status === 200 && !!waiterLogin.data.token);
    assert('Waiter login hides the password', waiterLogin.data.staff && waiterLogin.data.staff.password === undefined);
    const waiterToken = waiterLogin.data.token;

    const superLogin = await request('POST', '/api/auth/login', { email: 'superadmin@deragourmet.com', password: 'SuperAdmin#2026' });
    assert('Super admin login succeeds', superLogin.status === 200 && !!superLogin.data.token);
    const superToken = superLogin.data.token;

    assert('Wrong password is rejected', (await request('POST', '/api/auth/login', { email: 'hamza@deragourmet.com', password: 'nope' })).status === 401);

    // 4. Roles are enforced
    console.log('\n--- 4. Roles ---');
    assert('Waiter cannot create menu items (403)', (await request('POST', '/api/menu', { title: 'x', price: 1 }, bearer(waiterToken))).status === 403);
    assert('Waiter cannot read staff list (403)', (await request('GET', '/api/staff', null, bearer(waiterToken))).status === 403);
    assert('Restaurant admin cannot use super admin routes (403)', (await request('GET', '/api/super/restaurants', null, bearer(adminToken))).status === 403);
    assert('Waiter can read the live order board', (await request('GET', '/api/db', null, bearer(waiterToken))).status === 200);
    const staffList = await request('GET', '/api/staff', null, bearer(adminToken));
    assert('Admin staff list has no passwords', staffList.status === 200 && staffList.data.length > 0 && staffList.data.every(s => s.password === undefined));

    // 5. Restaurants are isolated from each other
    console.log('\n--- 5. Restaurant isolation ---');
    const created = await request('POST', '/api/super/restaurants', { name: 'Other Diner', email: 'other@diner.test' }, bearer(superToken));
    assert('Super admin can create a restaurant', created.status === 201);
    assert('New restaurant gets a generated password, shown once', typeof created.data.initialPassword === 'string' && created.data.initialPassword.length >= 10);
    assert('New restaurant gets a random 6-digit manager PIN', /^\d{6}$/.test(String(created.data.initialManagerPin)));
    assert('Create response hides stored secrets', !created.data.restaurant.managerPin && created.data.restaurant.credentials.password === undefined);
    const otherLogin = await request('POST', '/api/auth/login', { email: 'other@diner.test', password: created.data.initialPassword });
    assert('New restaurant admin can log in with the generated password', otherLogin.status === 200);
    const otherToken = otherLogin.data.token;
    assert('Other restaurant cannot delete Dera staff (403)', (await request('DELETE', '/api/staff/waiter-01', null, bearer(otherToken))).status === 403);
    assert('Other restaurant cannot edit Dera menu (403)', (await request('PUT', '/api/menu/dish-1', { price: 1 }, bearer(otherToken))).status === 403);
    assert('Other restaurant cannot change Dera billing (403)',
      (await request('POST', '/api/restaurant/billing-settings', { restaurantId: 'REST-001', billingCharges: [] }, bearer(otherToken))).status === 403);
    const otherStaff = await request('POST', '/api/staff', { name: 'Sneaky', role: 'waiter', restaurantId: 'REST-001', password: 'Sneaky#1' }, bearer(otherToken));
    assert('Staff created by another restaurant lands in that restaurant', otherStaff.status === 201 && otherStaff.data.staff.restaurantId === created.data.restaurant.id);

    // Staff edits cannot change role or restaurant
    const promote = await request('PUT', '/api/staff/waiter-01', { role: 'restaurant_admin', restaurantId: 'REST-999', name: 'Hamza Abbasi' }, bearer(adminToken));
    assert('Staff edit ignores role and restaurant changes', promote.status === 200 && promote.data.staff.role === 'waiter' && promote.data.staff.restaurantId !== 'REST-999');

    // 6. Guest orders cannot set prices
    console.log('\n--- 6. Guest orders ---');
    const tok07 = await tableToken('07');
    const tok06 = await tableToken('06');
    const fakeDish = await request('POST', '/api/broadcast', {
      type: 'NEW_ORDER', senderDeviceId: 'sec-dev-1', tableToken: tok07,
      order: { ticketId: '#TKT-SEC-1', restaurantId: 'REST-001', table: 'Table 07', items: [{ dishId: 'nope', title: 'Free Feast', price: 1, qty: 1 }] }
    });
    assert('Order with an item not on the menu is rejected (400)', fakeDish.status === 400, `got ${fakeDish.status}`);

    // A waiter taking the order on the floor skips the confirmation step
    const comboOrder = await request('POST', '/api/broadcast', {
      type: 'NEW_ORDER',
      order: { ticketId: '#TKT-SEC-2', restaurantId: 'REST-001', table: 'Table 07', items: [{ dishId: 'deal-1', title: 'Deal 1: Solo Crunch Fiesta', price: 1, qty: 1 }] }
    }, bearer(waiterToken));
    assert('Built-in combo deal is accepted at its real price', comboOrder.status === 200 && comboOrder.data.order.subtotal === 799, JSON.stringify(comboOrder.data).slice(0, 200));
    const comboTicketId = (comboOrder.data.order || {}).ticketId;
    assert('Server assigns its own ticket id', comboTicketId && comboTicketId !== '#TKT-SEC-2');

    const xssOrder = await request('POST', '/api/broadcast', {
      type: 'NEW_ORDER', senderDeviceId: 'sec-dev-3', tableToken: tok06,
      order: {
        ticketId: '#TKT-SEC-3', restaurantId: 'REST-001', table: 'Table 06',
        guest: '<img src=x onerror=alert(1)>', notes: '<script>alert(1)</script>',
        items: [{ dishId: 'dish-1', title: 'Chicken Makhni Karahi', qty: 1, spice: '"><svg onload=alert(1)>' }]
      }
    });
    const stored = xssOrder.data.order || {};
    assert('Guest name and notes are stripped of HTML', xssOrder.status === 200 && !/[<>]/.test(stored.guest + stored.notes));
    assert('Item options are stripped of HTML', !/[<>"]/.test(((stored.pendingItems || [])[0] || {}).spice));

    const badTicketId = await request('POST', '/api/broadcast', {
      type: 'NEW_ORDER', senderDeviceId: 'sec-dev-4', tableToken: tok06,
      order: { ticketId: "x');alert(1);//", restaurantId: 'REST-001', table: 'Table 06', newItemsOnly: true, items: [{ dishId: 'dish-5', qty: 1 }] }
    });
    assert('Client-chosen ticket ids are ignored', badTicketId.status === 200 && badTicketId.data.order.ticketId === stored.ticketId);

    // 7. Status changes need staff
    console.log('\n--- 7. Status and sold-out updates ---');
    assert('Anonymous STATUS_UPDATE is rejected (403)',
      (await request('POST', '/api/broadcast', { type: 'STATUS_UPDATE', ticketId: comboTicketId, status: 'Served' })).status === 403);
    assert('Anonymous sold-out update is rejected (403)',
      (await request('POST', '/api/broadcast', { type: 'ITEM_86_UPDATE', soldOutList: ['dish-1'] })).status === 403);
    assert('Anonymous custom events are rejected (403)',
      (await request('POST', '/api/broadcast', { type: 'TABLE_SESSION_UPDATED', table: 'Table 04' })).status === 403);
    assert('Waiter can update order status',
      (await request('POST', '/api/broadcast', { type: 'STATUS_UPDATE', ticketId: comboTicketId, status: 'Served' }, bearer(waiterToken))).status === 200);
    assert('Guests can ring the service bell with the table QR',
      (await request('POST', '/api/broadcast', { type: 'SERVICE_BELL', table: 'Table 07', tableToken: tok07, request: 'Water' })).status === 200);
    assert('Service bell without the table QR is rejected',
      (await request('POST', '/api/broadcast', { type: 'SERVICE_BELL', table: 'Table 07', request: 'Water' })).status === 403);

    const tableTicket = await request('GET', `/api/public/table-ticket?table=06&t=${tok06}`);
    assert('Guest can look up only their own table ticket', tableTicket.status === 200 &&
      tableTicket.data.tickets.length > 0 && tableTicket.data.tickets.every(t => t.table === 'Table 06'));
    assert('Table ticket lookup without the QR secret is rejected',
      (await request('GET', '/api/public/table-ticket?table=06')).status === 403);

    // 8. Manager PIN lockout
    console.log('\n--- 8. Manager PIN lockout ---');
    let lastStatus = 0;
    for (let i = 0; i < 5; i++) {
      lastStatus = (await request('POST', '/api/orders/void', { ticketId: comboTicketId, reason: 'test', managerPin: '000000' })).status;
    }
    assert('Wrong PINs are rejected (403)', lastStatus === 403);
    const locked = await request('POST', '/api/orders/void', { ticketId: comboTicketId, reason: 'test', managerPin: '7788' });
    assert('After 5 wrong PINs, even the right PIN is locked out (429)', locked.status === 429);

    // 9. Secrets at rest
    console.log('\n--- 9. Stored secrets ---');
    if (process.env.DB_FILE) {
      const raw = fs.readFileSync(process.env.DB_FILE, 'utf8');
      assert('No plaintext demo passwords in the database file',
        !raw.includes('DeraAdmin#2026') && !raw.includes('SuperAdmin#2026') && !raw.includes('Waiter#101'));
      assert('Passwords are stored as scrypt hashes', raw.includes('"scrypt$'));
    } else {
      console.log('(skipped: DB_FILE not set; run through run_tests.js)');
    }
  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log(`\nTEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  if (failed > 0) process.exit(1);
}

runTests();
