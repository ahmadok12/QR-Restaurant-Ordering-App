const http = require('http');

const BASE_URL = 'http://localhost:3000';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const postData = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch(e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('=== MULTI-PERSON TABLE HOST & GUEST ORDERING TEST ===\n');

  const table = '99'; // Dedicated test table
  const deviceHost = 'dev_test_host_001';
  const deviceGuest = 'dev_test_guest_002';

  // 0. Reset table 99 first
  console.log('1. Resetting test table 99...');
  await request('POST', '/api/test/reset-table', { table });

  // 1. Device 1 (Host) scans first
  console.log('2. Device 1 (1st scanner) joins table 99...');
  const join1 = await request('POST', '/api/table-session/join', {
    table,
    deviceId: deviceHost,
    name: 'Alice (Host)'
  });
  console.log('   Join 1 response:', join1.body);
  if (!join1.body.isHost) throw new Error('FAIL: 1st scanner must be Table Host!');
  console.log('   PASS: 1st scanner is registered as Table Host!');

  // 2. Device 2 (Guest) scans second
  console.log('\n3. Device 2 (2nd scanner) joins table 99...');
  const join2 = await request('POST', '/api/table-session/join', {
    table,
    deviceId: deviceGuest,
    name: 'Bob (Guest)'
  });
  console.log('   Join 2 response:', join2.body);
  if (join2.body.isHost) throw new Error('FAIL: 2nd scanner must NOT be Table Host!');
  if (join2.body.hostDeviceId !== deviceHost) throw new Error('FAIL: Table hostDeviceId mismatch!');
  console.log('   PASS: 2nd scanner is registered as Co-Diner/Guest!');

  // 2.5 Multi-Person Two-Way Cart Sync
  console.log('\n3.5 Testing Two-Way Real-Time Cart Sync between Host and Guest...');
  // Host adds Chicken Karahi
  const hostAdd = await request('POST', '/api/table-session/cart', {
    table,
    deviceId: deviceHost,
    action: 'add',
    item: { dishId: 101, title: 'Chicken Karahi', price: 1450, qty: 1, size: 'Standard Portion', spice: 'Chatpata 🌶️', note: '' }
  });
  if (hostAdd.body.cart.length !== 1) throw new Error('FAIL: Host add failed');
  console.log('   PASS: Host added Chicken Karahi to shared table cart!');

  // Guest adds Garlic Naan
  const guestAdd1 = await request('POST', '/api/table-session/cart', {
    table,
    deviceId: deviceGuest,
    action: 'add',
    item: { dishId: 201, title: 'Garlic Naan', price: 120, qty: 1, size: 'Standard Portion', spice: 'Normal 🍃', note: '' }
  });
  if (guestAdd1.body.cart.length !== 2) throw new Error('FAIL: Guest add failed to append');
  console.log('   PASS: Guest added Garlic Naan to shared table cart!');

  // Guest adds Sweet Lassi
  const guestAdd2 = await request('POST', '/api/table-session/cart', {
    table,
    deviceId: deviceGuest,
    action: 'add',
    item: { dishId: 301, title: 'Sweet Lassi', price: 250, qty: 1, size: 'Standard Portion', spice: 'Normal 🍃', note: '' }
  });
  if (guestAdd2.body.cart.length !== 3) throw new Error('FAIL: Guest add 2 failed');
  console.log('   PASS: Guest added Sweet Lassi to shared table cart (total 3 items)!');

  // Host adjusts Garlic Naan (+2)
  const hostAdjust = await request('POST', '/api/table-session/cart', {
    table,
    deviceId: deviceHost,
    action: 'adjust',
    delta: 2,
    item: { dishId: 201, title: 'Garlic Naan', size: 'Standard Portion', spice: 'Normal 🍃', note: '' }
  });
  const naanItem = hostAdjust.body.cart.find(i => i.dishId === 201);
  if (!naanItem || naanItem.qty !== 3) throw new Error('FAIL: Host adjust did not increase Garlic Naan qty to 3!');
  console.log('   PASS: Host adjusted Garlic Naan quantity to 3!');

  // Guest removes Sweet Lassi
  const guestRemove = await request('POST', '/api/table-session/cart', {
    table,
    deviceId: deviceGuest,
    action: 'remove',
    item: { dishId: 301, title: 'Sweet Lassi', size: 'Standard Portion', spice: 'Normal 🍃', note: '' }
  });
  if (guestRemove.body.cart.length !== 2) throw new Error('FAIL: Guest remove failed!');
  console.log('   PASS: Guest removed Sweet Lassi from shared table cart!');

  // Verify via Poll endpoint
  const pollCheck = await request('GET', `/api/table-session/poll?table=${table}&deviceId=${deviceGuest}`);
  if (!pollCheck.body.ok || pollCheck.body.draftCart.length !== 2) throw new Error('FAIL: Poll draftCart mismatch!');
  console.log('   PASS: Poll endpoint confirms 2 items in shared draft cart (all synced)!');

  // 3. Guest tries to submit initial order (must be blocked)
  console.log('\n4. Testing permission: Guest attempts to submit initial order...');
  const guestInitialOrder = {
    type: 'NEW_ORDER',
    senderDeviceId: deviceGuest,
    order: {
      ticketId: '#TKT-TEST-9901',
      restaurantId: 'REST-001',
      table: 'Table 99',
      guest: 'Bob (Guest)',
      items: [{ title: 'Chicken Biryani', price: 650, qty: 1 }],
      subtotal: 650,
      total: 683,
      status: 'New'
    }
  };
  const guestSubmitRes = await request('POST', '/api/broadcast', guestInitialOrder);
  console.log('   Guest submit response status:', guestSubmitRes.status, guestSubmitRes.body);
  if (guestSubmitRes.status !== 403) throw new Error('FAIL: Server must reject initial order from non-host with HTTP 403!');
  console.log('   PASS: Server rejected Guest initial order submission with 403!');

  // 4. Host submits initial order (must succeed)
  console.log('\n5. Host submits initial order...');
  const hostInitialOrder = {
    type: 'NEW_ORDER',
    senderDeviceId: deviceHost,
    order: {
      ticketId: '#TKT-TEST-9901',
      restaurantId: 'REST-001',
      table: 'Table 99',
      guest: 'Alice (Host)',
      items: [{ title: 'Chicken Karahi', price: 1450, qty: 1 }],
      subtotal: 1450,
      total: 1523,
      status: 'In Kitchen'
    }
  };
  const hostSubmitRes = await request('POST', '/api/broadcast', hostInitialOrder);
  console.log('   Host submit response status:', hostSubmitRes.status);
  if (hostSubmitRes.status !== 200) throw new Error('FAIL: Host submission failed!');
  console.log('   PASS: Host successfully submitted initial order!');

  // 5. Post-order addition: Guest orders extra dishes (must succeed now that order is active)
  console.log('\n6. Post-order round: Guest orders extra dishes (should be allowed for anyone)...');
  const guestPostOrder = {
    type: 'NEW_ORDER',
    senderDeviceId: deviceGuest,
    order: {
      ticketId: '#TKT-TEST-9901',
      restaurantId: 'REST-001',
      table: 'Table 99',
      guest: 'Bob (Guest)',
      items: [
        { title: 'Chicken Karahi', price: 1450, qty: 1 },
        { title: 'Garlic Naan', price: 120, qty: 2 }
      ],
      subtotal: 1690,
      total: 1775,
      status: 'In Kitchen'
    }
  };
  const guestPostRes = await request('POST', '/api/broadcast', guestPostOrder);
  console.log('   Guest post-order submit response status:', guestPostRes.status);
  if (guestPostRes.status !== 200) throw new Error('FAIL: Guest should be allowed to submit post-order dishes!');
  console.log('   PASS: Guest successfully submitted post-order dishes!');

  // 6. Waiter service: Guest calls waiter (must succeed)
  console.log('\n7. Waiter service: Guest calls waiter...');
  const guestBell = {
    type: 'SERVICE_BELL',
    senderDeviceId: deviceGuest,
    table: 'Table 99',
    request: 'Call Waiter Assistance'
  };
  const guestBellRes = await request('POST', '/api/broadcast', guestBell);
  console.log('   Guest bell response status:', guestBellRes.status);
  if (guestBellRes.status !== 200) throw new Error('FAIL: Waiter service call failed!');
  console.log('   PASS: Guest successfully requested waiter service!');

  // 7. Test role toggle endpoint
  console.log('\n8. Testing role toggle tool...');
  const toggleRes = await request('POST', '/api/table-session/switch-role', {
    table,
    deviceId: deviceGuest,
    targetRole: 'host'
  });
  console.log('   Toggle response:', toggleRes.body);
  if (!toggleRes.body.isHost) throw new Error('FAIL: Role switch did not make deviceGuest host!');
  console.log('   PASS: Role switch tool works as expected!');

  // 8. Cleanup test table 99
  console.log('\n9. Cleaning up test table 99...');
  await request('POST', '/api/test/reset-table', { table });
  console.log('   PASS: Test table 99 cleaned up!');

  console.log('\n===========================================');
  console.log('ALL MULTI-PERSON ORDERING TESTS PASSED (8/8)!');
  console.log('===========================================');
}

runTests().catch(err => {
  console.error('\nTEST ERROR:', err);
  process.exit(1);
});
