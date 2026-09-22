// Automated Verification: Multi-Person Cohost Automatic Screen Update & Real-Time Post-Order Sync
const http = require('http');

const BASE_URL = 'http://127.0.0.1:3000';

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {}
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
  await request('POST', '/api/test/reset-table', { table: '98' });

  // 2. Host (Device A) and Cohost (Device B) join Table 98
  const hostJoin = await request('POST', '/api/table-session/join', {
    table: '98',
    deviceId: 'dev_host_98',
    name: 'Table Host'
  });
  assert(hostJoin.data.isHost === true, 'Device A is registered as Host');

  const cohostJoin = await request('POST', '/api/table-session/join', {
    table: '98',
    deviceId: 'dev_cohost_98',
    name: 'Co-Diner'
  });
  assert(cohostJoin.data.isHost === false, 'Device B is registered as Cohost');
  assert(cohostJoin.data.hasActiveOrder === false, 'Initially table has no active order');

  // 3. Host fires initial order to kitchen
  console.log('\n[Scenario 1] Host fires initial order to kitchen...');
  const menuRes = await request('GET', '/api/menu');
  const dish1 = menuRes.data[0];

  const initialOrder = {
    ticketId: '#TKT-9801',
    table: 'Table 98',
    guest: 'Host',
    items: [{ dishId: dish1.id, title: dish1.title, price: dish1.price, qty: 1 }],
    senderDeviceId: 'dev_host_98'
  };

  const fireOrderRes = await request('POST', '/api/broadcast', {
    type: 'NEW_ORDER',
    order: initialOrder,
    senderDeviceId: 'dev_host_98'
  });
  assert(fireOrderRes.status === 200, 'Host fired order successfully');
  assert(fireOrderRes.data.order.ticketId === '#TKT-9801', 'Authoritative ticket generated');

  // 4. Verify Cohost polling receives active order immediately
  console.log('\n[Scenario 1 Check] Cohost background poll receives active ticket for auto screen switch...');
  const cohostPoll1 = await request('GET', '/api/table-session/poll?table=98&deviceId=dev_cohost_98');
  assert(cohostPoll1.data.hasActiveOrder === true, 'Cohost detects hasActiveOrder === true');
  assert(cohostPoll1.data.activeTicket != null, 'Cohost receives activeTicket');
  assert(cohostPoll1.data.activeTicket.items.length === 1, 'activeTicket has 1 dish');

  // 5. Cohost adds extra dish post-order
  console.log('\n[Scenario 2] Cohost adds extra dish post-order...');
  const dish2 = menuRes.data[1] || dish1;
  const postOrderTicket = {
    ...cohostPoll1.data.activeTicket,
    items: [
      ...cohostPoll1.data.activeTicket.items,
      { dishId: dish2.id, title: dish2.title, price: dish2.price, qty: 1 }
    ],
    senderDeviceId: 'dev_cohost_98'
  };

  const cohostAddRes = await request('POST', '/api/broadcast', {
    type: 'NEW_ORDER',
    order: postOrderTicket,
    senderDeviceId: 'dev_cohost_98'
  });
  assert(cohostAddRes.status === 200, 'Cohost post-order addition accepted');
  assert(cohostAddRes.data.order.items.length === 2, 'Authoritative order now has 2 items');

  // 6. Host polling check: Host receives updated items & recalculated total without refresh!
  console.log('\n[Scenario 2 Check] Host background poll detects updated items and total in realtime...');
  const hostPollAfter = await request('GET', '/api/table-session/poll?table=98&deviceId=dev_host_98');
  assert(hostPollAfter.data.activeTicket != null, 'Host receives activeTicket');
  assert(hostPollAfter.data.activeTicket.items.length === 2, 'Host receives 2 items in real-time');
  assert(hostPollAfter.data.activeTicket.total > fireOrderRes.data.order.total, 'Host receives updated grand total');

  // 7. Cleanup
  await request('POST', '/api/test/reset-table', { table: '98' });

  console.log(`\n========================================`);
  console.log(`RESULTS: Passed: ${passed}, Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runTest();
