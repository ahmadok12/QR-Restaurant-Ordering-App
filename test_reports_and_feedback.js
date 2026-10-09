// Automated Test Suite: sales report, guest feedback, bill requests and ready-time estimates
const { api, bearer, adminToken, tableToken, setOrderSettings, resetTable } = require('./test_utils');

async function runTests() {
  console.log('=== REPORTS, FEEDBACK & BILL REQUEST TESTS ===\n');
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
    const admin = bearer(await adminToken());
    const waiter = bearer((await api('POST', '/api/auth/login', { email: 'hamza@deragourmet.com', password: 'Waiter#101' })).data.token);
    const cashier = bearer((await api('POST', '/api/auth/login', { email: 'cashier@deragourmet.com', password: 'Cashier#2026' })).data.token);
    await setOrderSettings({ requireWaiterConfirm: true, requireTableOpen: false, orderingPaused: false });

    const T = '92';
    await resetTable(T);
    const tok = await tableToken(T);

    // 1. Order, confirm, ETA
    console.log('--- 1. Ready-time estimate ---');
    const order = await api('POST', '/api/broadcast', {
      type: 'NEW_ORDER', senderDeviceId: 'rf-dev-1', tableToken: tok,
      order: { restaurantId: 'REST-001', table: `Table ${T}`, guest: 'Report Guest', newItemsOnly: true, items: [{ dishId: 'dish-1', title: 'Chicken Makhni Karahi', qty: 2 }] }
    });
    const ticketId = order.data.order.ticketId;
    assert('No ready time before the waiter confirms', order.data.order.estimatedReadyAt === null);
    const confirmed = await api('POST', '/api/orders/confirm', { ticketId }, waiter);
    const eta = confirmed.data.ticket.estimatedReadyAt;
    assert('Confirmed order gets an estimated ready time in the future', eta > Date.now() && eta < Date.now() + 121 * 60000);

    // 2. Bill request
    console.log('\n--- 2. Bill request ---');
    const bell = await api('POST', '/api/broadcast', { type: 'SERVICE_BELL', table: `Table ${T}`, tableToken: tok, request: 'Bill please' });
    assert('Guest can ask for the bill', bell.status === 200);
    const again = await api('POST', '/api/broadcast', { type: 'SERVICE_BELL', table: `Table ${T}`, tableToken: tok, request: 'Bill please' });
    assert('A double tap does not ring twice', again.status === 200 && again.data.duplicate === true);
    const view = (await api('GET', `/api/public/table-ticket?table=${T}&t=${tok}`)).data.tickets.find(t => t.ticketId === ticketId);
    assert('Ticket is marked as bill requested', view.billRequested === true);

    // 3. Settle, then sales report
    console.log('\n--- 3. Sales report ---');
    await api('POST', '/api/cashier/shift/open', { openingFloat: 1000 }, cashier);
    const settle = await api('POST', '/api/cashier/settle', { ticketId, paymentMethod: 'Card' }, cashier);
    assert('Cashier settles the bill', settle.status === 200, JSON.stringify(settle.data));

    assert('Waiters cannot read the sales report', (await api('GET', '/api/reports/sales', null, waiter)).status === 403);
    const sales = await api('GET', '/api/reports/sales', null, admin);
    const r = sales.data.report || { totals: {}, sales: [] };
    assert('Sales report loads for today', sales.status === 200 && r.totals.orders >= 1);
    assert('Report includes the settled bill', r.sales.some(s => s.ticketId === ticketId && s.total === settle.data.sale.total));
    assert('Report breaks sales down by dish', r.topDishes.some(d => d.title === 'Chicken Makhni Karahi' && d.qty >= 2));
    assert('Report breaks sales down by payment method', r.byPayment.some(p => p.key === 'Card'));
    assert('Report breaks sales down by waiter', r.byWaiter.length > 0);

    const csv = await api('GET', '/api/reports/sales?format=csv', null, admin);
    assert('Sales report downloads as CSV', csv.status === 200 && typeof csv.data === 'string' && csv.data.startsWith('invoiceNumber,date') && csv.data.includes(settle.data.invoiceNumber));
    const empty = await api('GET', '/api/reports/sales?from=2000-01-01&to=2000-01-02', null, admin);
    assert('Date range filters the report', empty.data.report.totals.orders === 0);

    // 4. Feedback
    console.log('\n--- 4. Guest feedback ---');
    assert('Feedback without the table QR secret is rejected',
      (await api('POST', '/api/public/feedback', { ticketId, rating: 5, deviceId: 'rf-dev-1' })).status === 403);
    assert('Out-of-range rating is rejected',
      (await api('POST', '/api/public/feedback', { ticketId, rating: 9, tableToken: tok, deviceId: 'rf-dev-1' })).status === 400);
    const fb = await api('POST', '/api/public/feedback', { ticketId, rating: 4, comment: 'Great <b>karahi</b>', tableToken: tok, deviceId: 'rf-dev-1' });
    assert('Guest feedback is saved', fb.status === 200);
    await api('POST', '/api/public/feedback', { ticketId, rating: 5, comment: 'Changed my mind', tableToken: tok, deviceId: 'rf-dev-1' });
    const fbReport = await api('GET', '/api/reports/feedback', null, admin);
    const mine = fbReport.data.report.entries.filter(e => e.ticketId === ticketId);
    assert('Rating again from the same phone updates instead of adding', mine.length === 1 && mine[0].rating === 5);
    assert('Feedback report has an average', typeof fbReport.data.report.averageRating === 'number');
    assert('Waiters cannot read feedback', (await api('GET', '/api/reports/feedback', null, waiter)).status === 403);

    // 5. Online orders can be re-read only by the phone that placed them
    const online = await api('POST', '/api/broadcast', {
      type: 'NEW_ORDER', senderDeviceId: 'rf-online-1',
      order: { restaurantId: 'REST-001', table: 'Online Order', guest: 'Online Guest', newItemsOnly: true, items: [{ dishId: 'dish-5', title: 'Peshawari Beef Chapli Kabab', qty: 1 }] }
    });
    const onlineId = online.data.order && online.data.order.ticketId;
    const own = await api('GET', `/api/public/online-ticket?ticketId=${encodeURIComponent(onlineId)}&deviceId=rf-online-1`);
    assert('Online guest can re-read their order', own.status === 200 && own.data.ticket.ticketId === onlineId);
    assert('Another phone cannot read it',
      (await api('GET', `/api/public/online-ticket?ticketId=${encodeURIComponent(onlineId)}&deviceId=someone-else`)).status === 404);
    await api('POST', '/api/orders/reject', { ticketId: onlineId, reason: 'test cleanup' }, waiter);

    // 6. Waiter app can be installed
    const manifest = await api('GET', '/waiter.webmanifest');
    assert('Waiter app manifest is served', manifest.status === 200 && manifest.data.start_url === '/waiter.html');

    await resetTable(T);
  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log(`\nTEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  if (failed > 0) process.exit(1);
}

runTests();
