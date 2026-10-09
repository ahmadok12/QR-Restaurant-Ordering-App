// Automated Verification: Multi-Person Cohost Automatic Screen Update & Real-Time Post-Order Sync
const http = require('http');

const BASE_URL = 'http://127.0.0.1:3000';

function request(method, path, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch(e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Table reset is admin-only, so log in as the demo restaurant admin for it.
async function resetTable(table) {
  const login = await request('POST', '/api/auth/login', { email: 'owner@deragourmet.com', password: 'DeraAdmin#2026' });
  return request('POST', '/api/test/reset-table', { table }, { 'Authorization': `Bearer ${login.data.token}` });
}

const { tableToken, adminToken, bearer } = require('./test_utils');

async function runTest() {
  console.log('=== MULTI-PERSON COHOST & HOST REALTIME SYNC TEST ===');
  let passed = 0;
  let failed = 0;

  function assert(condition, desc) {
    if (condition) {
      console.log(`\x1b[32m✔ PASS:\x1b[0m ${desc}`);
      passed++;
    } else {
      console.error(`\x1b[31m✖ FAIL:\x1b[0m ${desc}`);
      failed++;
    }
  }

  // 1. Reset test table 98
  await resetTable('98');

  const tok = await tableToken('98');
  const staff = bearer(await adminToken());
  const json = { 'Content-Type': 'application/json' };

  // 2. Host (Device A) and Cohost (Device B) join Table 98
  const hostJoin = await request('POST', '/api/table-session/join', {
    table: '98',
    tableToken: tok,
    deviceId: 'dev_host_98',
    name: 'Table Host'
  });
  assert(hostJoin.data.isHost === true, 'Device A is registered as Host');

  const cohostJoin = await request('POST', '/api/table-session/join', {
    table: '98',
    tableToken: tok,
    deviceId: 'dev_cohost_98',
    name: 'Co-Diner'
  });
  assert(cohostJoin.data.isHost === false, 'Device B is registered as Cohost');
  assert(cohostJoin.data.hasActiveOrder === false, 'Initially table has no active order');

  // 3. Host fires initial order; it waits for the waiter
  console.log('\n[Scenario 1] Host fires initial order...');
  const menuRes = await request('GET', '/api/menu');
  const dish1 = menuRes.data[0];
  const dish2 = menuRes.data[1] || dish1;

  const fireOrderRes = await request('POST', '/api/broadcast', {
    type: 'NEW_ORDER',
    senderDeviceId: 'dev_host_98',
    tableToken: tok,
    order: {
      ticketId: '#TKT-9801',
      table: 'Table 98',
      guest: 'Host',
      newItemsOnly: true,
      items: [{ dishId: dish1.id, title: dish1.title, price: dish1.price, qty: 1 }]
    }
  });
  assert(fireOrderRes.status === 200, 'Host fired order successfully');
  const ticketId = fireOrderRes.data.order.ticketId;
  assert(ticketId && ticketId !== '#TKT-9801', 'Server assigned its own ticket id');
  assert(fireOrderRes.data.order.status === 'Pending', 'New order waits for waiter confirmation');

  // 4. Cohost sees the pending order straight away
  console.log('\n[Scenario 1 Check] Cohost poll sees the order waiting for the waiter...');
  const cohostPoll1 = await request('GET', `/api/table-session/poll?table=98&deviceId=dev_cohost_98&t=${tok}`);
  assert(cohostPoll1.data.hasActiveOrder === true, 'Cohost detects hasActiveOrder === true');
  assert(cohostPoll1.data.activeTicket.pendingItems.length === 1, 'activeTicket shows 1 dish waiting for confirmation');
  assert(cohostPoll1.data.activeTicket.total === 0, 'Nothing is on the bill until the waiter confirms');

  const confirm1 = await request('POST', '/api/orders/confirm', { ticketId }, { ...json, ...staff });
  assert(confirm1.status === 200 && confirm1.data.ticket.items.length === 1, 'Waiter confirms round 1');
  const firstTotal = confirm1.data.ticket.total;

  // 5. Cohost adds an extra dish as a new round
  console.log('\n[Scenario 2] Cohost adds extra dish post-order...');
  const cohostAddRes = await request('POST', '/api/broadcast', {
    type: 'NEW_ORDER',
    senderDeviceId: 'dev_cohost_98',
    tableToken: tok,
    order: { table: 'Table 98', guest: 'Co-Diner', newItemsOnly: true, items: [{ dishId: dish2.id, title: dish2.title, price: dish2.price, qty: 1 }] }
  });
  assert(cohostAddRes.status === 200, 'Cohost post-order addition accepted');
  assert(cohostAddRes.data.order.ticketId === ticketId, 'Addition joins the same table ticket');
  assert(cohostAddRes.data.order.items.length === 1 && cohostAddRes.data.order.pendingItems.length === 1, 'Addition waits as round 2');

  await request('POST', '/api/orders/confirm', { ticketId }, { ...json, ...staff });

  // 6. Host polling check: Host receives updated items & recalculated total without refresh!
  console.log('\n[Scenario 2 Check] Host background poll detects updated items and total in realtime...');
  const hostPollAfter = await request('GET', `/api/table-session/poll?table=98&deviceId=dev_host_98&t=${tok}`);
  assert(hostPollAfter.data.activeTicket != null, 'Host receives activeTicket');
  assert(hostPollAfter.data.activeTicket.items.length === 2, 'Host receives 2 items in real-time');
  assert(hostPollAfter.data.activeTicket.total > firstTotal, 'Host receives updated grand total');

  // 6.5 Without the QR secret the poll is refused
  const noTokenPoll = await request('GET', '/api/table-session/poll?table=98&deviceId=dev_host_98');
  assert(noTokenPoll.status === 403, 'Poll without the QR code secret is rejected');

  // 7. Cleanup
  await resetTable('98');

  console.log(`\n========================================`);
  console.log(`RESULTS: Passed: ${passed}, Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runTest();
