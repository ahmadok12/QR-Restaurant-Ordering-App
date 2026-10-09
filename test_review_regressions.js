// Automated Test Suite: regressions found in code review (order flow, scoping, privacy)
const http = require('http');
const { api, bearer, adminToken, tableToken, setOrderSettings, resetTable, BASE_URL } = require('./test_utils');

// Collects live events for a while on one connection.
function listen(query, ms) {
  return new Promise(resolve => {
    const events = [];
    const req = http.get(new URL('/api/events' + query, BASE_URL), res => {
      let buf = '';
      res.on('data', chunk => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const line = block.split('\n').find(l => l.startsWith('data: '));
          if (line) { try { events.push(JSON.parse(line.slice(6))); } catch (e) {} }
        }
      });
    });
    setTimeout(() => { req.destroy(); resolve(events); }, ms);
  });
}

async function runTests() {
  console.log('=== CODE REVIEW REGRESSION TESTS ===\n');
  let passed = 0;
  let failed = 0;
  function assert(desc, condition, detail = '') {
    if (condition) { console.log(`[PASS] ${desc}`); passed++; }
    else { console.error(`[FAIL] ${desc} ${detail}`); failed++; }
  }
  let dev = 0;
  const order = (table, tok, items, device) => api('POST', '/api/broadcast', {
    type: 'NEW_ORDER', senderDeviceId: device || `rr-dev-${++dev}`, tableToken: tok,
    order: { restaurantId: 'REST-001', table: `Table ${table}`, guest: 'Guest', newItemsOnly: true, items }
  });

  try {
    const adminT = await adminToken();
    const admin = bearer(adminT);
    const waiterT = (await api('POST', '/api/auth/login', { email: 'hamza@deragourmet.com', password: 'Waiter#101' })).data.token;
    const waiter = bearer(waiterT);
    const cashier = bearer((await api('POST', '/api/auth/login', { email: 'cashier@deragourmet.com', password: 'Cashier#2026' })).data.token);
    await setOrderSettings({ requireWaiterConfirm: true, requireTableOpen: false, orderingPaused: false });

    // 1. Removing an already-served line still needs the PIN after an add-on round
    const A = '81';
    await resetTable(A);
    const tokA = await tableToken(A);
    const o1 = await order(A, tokA, [{ dishId: 'dish-1', title: 'Chicken Makhni Karahi', qty: 1 }]);
    const tid = o1.data.order.ticketId;
    await api('POST', '/api/orders/confirm', { ticketId: tid }, waiter);
    for (const st of ['In Kitchen', 'Plated & Ready', 'Served']) {
      await api('POST', '/api/broadcast', { type: 'STATUS_UPDATE', ticketId: tid, status: st }, waiter);
    }
    await api('POST', '/api/broadcast', { type: 'NEW_ORDER', order: { table: `Table ${A}`, items: [{ dishId: 'dish-5', title: 'Peshawari Beef Chapli Kabab', qty: 1 }] } }, waiter);
    const view = (await api('GET', `/api/public/table-ticket?table=${A}&t=${tokA}`)).data.tickets.find(t => t.ticketId === tid);
    assert('Add-on round puts the ticket back to New', view.status === 'New');
    const served = view.items.find(l => l.dishId === 'dish-1');
    const added = view.items.find(l => l.dishId === 'dish-5');
    assert('Removing a served dish still needs the manager PIN',
      (await api('POST', '/api/orders/remove-line', { ticketId: tid, lineId: served.lineId, reason: 'x' }, waiter)).status === 403);
    // (a correct PIN clears the failed attempt so later suites start with a clean lockout counter)
    await api('POST', '/api/orders/remove-line', { ticketId: tid, lineId: served.lineId, reason: 'guest complaint', managerPin: '7788' }, waiter);
    assert('The new, not-yet-cooked dish can be removed without a PIN',
      (await api('POST', '/api/orders/remove-line', { ticketId: tid, lineId: added.lineId, reason: 'wrong item' }, waiter)).status === 200);

    // 2. Size options are priced
    const sized = await api('POST', '/api/broadcast', { type: 'NEW_ORDER', order: { table: `Table ${A}`, items: [{ dishId: 'dish-1', title: 'Chicken Makhni Karahi', qty: 1, size: 'Full (1.0 kg)' }] } }, waiter);
    const fullLine = (sized.data.order.items || []).filter(l => l.dishId === 'dish-1').pop();
    assert('A bigger size costs more than the base price', fullLine && fullLine.price > 1250, JSON.stringify(fullLine && fullLine.price));

    // 3. Service bell events carry only known fields
    const T2 = '82';
    await resetTable(T2);
    const tok2 = await tableToken(T2);
    const staffEvents = listen(`?token=${encodeURIComponent(adminT)}`, 1200);
    await new Promise(r => setTimeout(r, 200));
    await api('POST', '/api/broadcast', { type: 'SERVICE_BELL', table: `Table ${T2}`, tableToken: tok2, request: 'Water', senderDeviceId: 'secret-device', injected: '<img>' });
    const bellEv = (await staffEvents).find(e => e.type === 'SERVICE_BELL');
    assert('Bell event reaches staff', !!bellEv);
    assert('Bell event has no device id or extra fields', bellEv && !bellEv.senderDeviceId && !bellEv.injected && !bellEv.tableToken);

    // 4. Live order events only reach the right table's guests
    const guestA = listen(`?table=${A}&t=${tokA}`, 1500);
    const guestNoCode = listen(`?table=${T2}&t=wrong`, 1500);
    const anon = listen('', 1500);
    await new Promise(r => setTimeout(r, 200));
    await order(T2, tok2, [{ dishId: 'dish-5', title: 'Peshawari Beef Chapli Kabab', qty: 1 }]);
    await api('POST', '/api/broadcast', { type: 'ITEM_86_UPDATE', soldOutList: [] }, waiter);
    const [evA, evBad, evAnon] = await Promise.all([guestA, guestNoCode, anon]);
    assert("Another table's guest does not get this order", !evA.some(e => e.type === 'NEW_ORDER'));
    assert('A wrong QR code gets no order events', !evBad.some(e => e.type === 'NEW_ORDER'));
    assert('An anonymous connection gets no order events', !evAnon.some(e => e.type === 'NEW_ORDER'));
    assert('Public menu events still reach everyone', evAnon.some(e => e.type === 'ITEM_86_UPDATE'));

    // 5. An open ticket's restaurant cannot be swapped by the guest
    const swap = await api('POST', '/api/broadcast', {
      type: 'NEW_ORDER', senderDeviceId: 'rr-swap', tableToken: tok2,
      order: { restaurantId: 'REST-002', table: `Table ${T2}`, newItemsOnly: true, items: [{ dishId: 'dish-5', title: 'Peshawari Beef Chapli Kabab', qty: 1 }] }
    });
    assert('Naming another restaurant for an open table is refused', swap.status === 409 || swap.status === 404, `got ${swap.status}`);

    // 6. Cart calls need a phone id
    assert('Cart change without a device id is rejected',
      (await api('POST', '/api/table-session/cart', { table: T2, tableToken: tok2, action: 'clear' })).status === 400);

    // 7. Settling by ticket ignores a different table in the request, and admin settles count in the shift
    await api('POST', '/api/cashier/shift/open', { openingFloat: 1000 }, cashier);
    const before = ((await api('GET', '/api/db', null, admin)).data.shifts || []).find(s => s.status === 'open');
    const t2Ticket = (await api('GET', `/api/public/table-ticket?table=${T2}&t=${tok2}`)).data.tickets[0];
    await api('POST', '/api/orders/confirm', { ticketId: t2Ticket.ticketId }, waiter);
    const settle = await api('POST', '/api/cashier/settle', { ticketId: t2Ticket.ticketId, table: `Table ${A}`, paymentMethod: 'Cash' }, admin);
    assert('Admin can settle', settle.status === 200, JSON.stringify(settle.data));
    assert('Sale is recorded on the ticket\'s own table', settle.data.sale && settle.data.sale.table === `Table ${T2}`);
    const aView = (await api('GET', `/api/public/table-ticket?table=${A}&t=${tokA}`)).data.tickets.find(t => t.ticketId === tid);
    assert('The other table named in the request keeps its order', aView && aView.status !== 'Settled');
    const after = ((await api('GET', '/api/db', null, admin)).data.shifts || []).find(s => s.id === (before && before.id));
    assert("Admin's cash settle is added to the cashier's shift", after && after.transactionsCount === (before.transactionsCount || 0) + 1);

    // 8. Feedback only after paying, and only from the table's phones
    const fbStranger = await api('POST', '/api/public/feedback', { ticketId: t2Ticket.ticketId, rating: 1, tableToken: tok2, deviceId: 'random-phone' });
    assert('A phone that was not at the table cannot rate', fbStranger.status === 403);
    const fbOpen = await api('POST', '/api/public/feedback', { ticketId: tid, rating: 1, tableToken: tokA, deviceId: 'rr-dev-1' });
    assert('An unpaid visit cannot be rated yet', fbOpen.status === 409);

    // 9. Audit log shows this restaurant's order events
    const logs = (await api('GET', '/api/audit-logs', null, admin)).data || [];
    assert("Owner's audit log includes order events", logs.some(l => /^ORDER_|^LINE_VOID/.test(l.action)));

    // 10. Waiters get a trimmed database
    const wdb = (await api('GET', '/api/db', null, waiter)).data;
    const raw = JSON.stringify(wdb);
    assert('Waiters do not get the audit log, sales or feedback', wdb.auditLogs.length === 0 && wdb.sales.length === 0 && wdb.feedback.length === 0);
    assert('No guest device ids in the waiter\'s data', !raw.includes('rr-dev-') && !raw.includes('rr-swap'));

    // 11. Voids need a staff login
    assert('Void without login is rejected', (await api('POST', '/api/orders/void', { ticketId: tid, reason: 'x', managerPin: '0000' })).status === 401);

    // 12. Menu: one restaurant cannot delete another's dish by reusing its id
    const superT = (await api('POST', '/api/auth/login', { email: 'superadmin@deragourmet.com', password: 'SuperAdmin#2026' })).data.token;
    const created = await api('POST', '/api/menu', { restaurantId: 'REST-777', id: 'dish-2', title: 'Copycat', price: 10, category: 'mains' }, bearer(superT));
    assert('New dishes get a server-made id', created.data.dish && created.data.dish.id !== 'dish-2');
    const menu = (await api('GET', '/api/menu?restaurantId=REST-001')).data;
    assert('Original dish-2 is still on the menu', menu.some(d => d.id === 'dish-2'));

    // 13. Turning the waiter app off stops existing waiter logins
    await api('POST', '/api/restaurant/modules', { waiterAppEnabled: false }, admin);
    const blocked = await api('POST', '/api/orders/confirm', { ticketId: tid }, waiter);
    await api('POST', '/api/restaurant/modules', { waiterAppEnabled: true }, admin);
    assert('A waiter token stops working while the app is off', blocked.status === 401 || blocked.status === 403);

    await resetTable(A);
    await resetTable(T2);
  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }
  console.log(`\nTEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  if (failed > 0) process.exit(1);
}

runTests();
