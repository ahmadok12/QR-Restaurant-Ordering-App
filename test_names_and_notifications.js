// Automated test: guest names at the start + "joined" / "added" notifications for everyone at the table
// Run with the server running:  node test_names_and_notifications.js
const http = require('http');

const BASE_URL = 'http://127.0.0.1:3000';

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {}
    }, (res) => {
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

async function run() {
  console.log('=== GUEST NAMES & TABLE NOTIFICATIONS TEST ===');
  const table = '97';
  const host = 'dev_names_host';
  const guest = 'dev_names_guest';
  const dish = { dishId: 'test-karahi', title: 'Chicken Karahi', price: 1450, qty: 1, size: 'Half', spice: 'Medium', note: '' };

  await request('POST', '/api/test/reset-table', { table });

  // 1. Before anyone joins, the table is empty
  const peek0 = await request('GET', `/api/table-session/peek?table=${table}`);
  assert(peek0.status === 200 && peek0.body.active === false, 'Empty table: peek says nobody is here yet');

  // 2. First scanner gives a name and becomes host
  const j1 = await request('POST', '/api/table-session/join', { table, deviceId: host, name: 'Ahmad' });
  assert(j1.body.isHost === true, 'First person to scan becomes table host');
  assert(j1.body.myName === 'Ahmad' && j1.body.hostName === 'Ahmad', 'Host name is saved as "Ahmad"');

  // 3. The name screen for the next guest can show who is hosting
  const peek1 = await request('GET', `/api/table-session/peek?table=${table}`);
  assert(peek1.body.active === true && peek1.body.hostName === 'Ahmad', 'Peek shows Ahmad is hosting');
  assert(peek1.body.participants.length === 1, 'Peek lists 1 person at the table');

  const seqBeforeGuest = j1.body.eventSeq;

  // 4. Second scanner joins with a name and does NOT take over or wipe the cart
  await request('POST', '/api/table-session/cart', { table, deviceId: host, action: 'add', item: { ...dish } });
  const j2 = await request('POST', '/api/table-session/join', { table, deviceId: guest, name: 'Sara' });
  assert(j2.body.isHost === false, 'Second person joins as co-diner, not host');
  assert(j2.body.hostName === 'Ahmad', 'Co-diner sees Ahmad as host');
  assert(Array.isArray(j2.body.draftCart) && j2.body.draftCart.length === 1, 'Joining does not clear the shared cart');
  assert(j2.body.participants.map(p => p.name).join(',') === 'Ahmad,Sara', 'Participants list is Ahmad, Sara');

  // 5. Host's phone gets a "Sara joined" notification through the poll fallback
  const poll1 = await request('GET', `/api/table-session/poll?table=${table}&deviceId=${host}&since=${seqBeforeGuest}`);
  const joinEv = (poll1.body.events || []).find(e => e.kind === 'joined' && e.name === 'Sara');
  assert(!!joinEv && joinEv.text === 'Sara joined the table', 'Host is notified: "Sara joined the table"');

  // 6. Sara adds a dish -> Ahmad is notified with her name and the dish
  const seqBeforeAdd = poll1.body.eventSeq;
  const add = await request('POST', '/api/table-session/cart', { table, deviceId: guest, action: 'add', item: { ...dish, qty: 2 } });
  const saraLine = add.body.cart.find(l => l.addedByDeviceId === guest);
  assert(!!saraLine && saraLine.addedByName === 'Sara' && saraLine.qty === 2, "Sara's dishes are her own cart line, tagged with her name");
  assert(add.body.cart.length === 2, "Ahmad's and Sara's identical dishes stay as separate lines");
  const poll2 = await request('GET', `/api/table-session/poll?table=${table}&deviceId=${host}&since=${seqBeforeAdd}`);
  const addEv = (poll2.body.events || []).find(e => e.kind === 'item_added');
  assert(!!addEv && addEv.text === 'Sara added 2× Chicken Karahi' && addEv.deviceId === guest, 'Host is notified: "Sara added 2× Chicken Karahi"');

  // 7. Removing an item also notifies
  const seqBeforeRemove = poll2.body.eventSeq;
  await request('POST', '/api/table-session/cart', { table, deviceId: guest, action: 'adjust', delta: -1, item: { ...saraLine } });
  const poll3 = await request('GET', `/api/table-session/poll?table=${table}&deviceId=${host}&since=${seqBeforeRemove}`);
  const remEv = (poll3.body.events || []).find(e => e.kind === 'item_removed');
  assert(!!remEv && remEv.text === 'Sara removed 1× Chicken Karahi', 'Host is notified: "Sara removed 1× Chicken Karahi"');

  // 8. Rejoining (page reload) does not create duplicate people or duplicate "joined" alerts
  const seqBeforeRejoin = poll3.body.eventSeq;
  await request('POST', '/api/table-session/join', { table, deviceId: guest, name: 'Sara' });
  const poll4 = await request('GET', `/api/table-session/poll?table=${table}&deviceId=${host}&since=${seqBeforeRejoin}`);
  assert(poll4.body.participants.length === 2, 'Reloading the page keeps 2 participants (no duplicate)');
  assert((poll4.body.events || []).length === 0, 'Reloading the page does not send another "joined" alert');

  // 9. Names are cleaned (no HTML) and length-limited
  const j3 = await request('POST', '/api/table-session/join', { table, deviceId: 'dev_names_x', name: '<b>Bilal</b> with a very very long name indeed' });
  assert(!/[<>]/.test(j3.body.myName) && j3.body.myName.length <= 24, 'Guest names are cleaned of HTML and limited to 24 characters');

  // 10. A guest with no name still gets a friendly default
  const j4 = await request('POST', '/api/table-session/join', { table, deviceId: 'dev_names_y', name: '' });
  assert(/^Guest \d+$/.test(j4.body.myName), 'A guest without a name is called "Guest N"');

  await request('POST', '/api/test/reset-table', { table });

  console.log('\n========================================');
  console.log(`RESULTS: Passed: ${passed}, Failed: ${failed}`);
  console.log('========================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
