// Automated Test Suite: order controls (waiter confirmation, add-on rounds, status rules, QR secrets, removals)
const { api, bearer, adminToken, tableToken, setOrderSettings, resetTable } = require('./test_utils');

async function runTests() {
  console.log('=== ORDER CONTROL TESTS ===\n');
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

  let deviceSeq = 0;
  const device = () => `oc-dev-${++deviceSeq}`;
  const guestOrder = (table, token, items, extra = {}) => api('POST', '/api/broadcast', {
    type: 'NEW_ORDER', senderDeviceId: extra.device || device(), tableToken: token,
    order: { restaurantId: 'REST-001', table: `Table ${table}`, guest: 'Guest', newItemsOnly: true, items, ...(extra.order || {}) }
  });

  try {
    const admin = bearer(await adminToken());
    const waiterLogin = await api('POST', '/api/auth/login', { email: 'hamza@deragourmet.com', password: 'Waiter#101' });
    const waiter = bearer(waiterLogin.data.token);
    const cashierLogin = await api('POST', '/api/auth/login', { email: 'cashier@deragourmet.com', password: 'Cashier#2026' });
    const cashier = bearer(cashierLogin.data.token);
    await setOrderSettings({ requireWaiterConfirm: true, requireTableOpen: false, orderingPaused: false });

    const T = '91';
    await resetTable(T);
    const tok = await tableToken(T);
    const karahi = { dishId: 'dish-1', title: 'Chicken Makhni Karahi', qty: 1 };
    const kabab = { dishId: 'dish-5', title: 'Peshawari Beef Chapli Kabab', qty: 2 };

    // 1. QR code checks
    console.log('--- 1. QR code and table checks ---');
    const ghost = await guestOrder('77', 'whatever', [karahi]);
    assert('Order for a table that does not exist is rejected', ghost.status === 403 && ghost.data.invalidTable === true);
    assert('Order with a wrong QR secret is rejected (403)',
      (await guestOrder(T, 'photo-of-old-code', [karahi])).status === 403);
    assert('Order with no QR secret is rejected (403)',
      (await guestOrder(T, undefined, [karahi])).status === 403);

    // 2. Limits
    console.log('\n--- 2. Quantity and size limits ---');
    const tooMany = await guestOrder(T, tok, [{ ...karahi, qty: 25 }]);
    assert('Absurd quantity on one line is rejected (400)', tooMany.status === 400, JSON.stringify(tooMany.data));
    const manyLines = Array.from({ length: 31 }, (_, i) => ({ ...karahi, notes: `line ${i}` }));
    assert('More than 30 lines in one round is rejected (400)', (await guestOrder(T, tok, manyLines)).status === 400);

    // 3. Waiter confirmation
    console.log('\n--- 3. Waiter confirmation ---');
    const hostDevice = device();
    const first = await guestOrder(T, tok, [karahi, kabab], { device: hostDevice, order: { status: 'Served', ticketId: '#TKT-MINE' } });
    const ticketId = first.data.order && first.data.order.ticketId;
    assert('Guest order is accepted', first.status === 200, JSON.stringify(first.data));
    assert('Client-set status is ignored: order waits as Pending', first.data.order.status === 'Pending');
    assert('Nothing is billed before the waiter confirms', first.data.order.total === 0 && first.data.order.pendingItems.length === 2);

    const rapid = await guestOrder(T, tok, [karahi], { device: hostDevice });
    assert('Same phone sending again within seconds is slowed down (429)', rapid.status === 429);

    assert('Guests cannot confirm their own order',
      (await api('POST', '/api/orders/confirm', { ticketId })).status === 401);

    const kababLine = first.data.order.pendingItems.find(l => l.dishId === 'dish-5');
    const raise = await api('POST', '/api/orders/confirm', { ticketId, lines: [{ lineId: kababLine.lineId, qty: 9 }] }, waiter);
    assert('Waiter confirms with an attempted quantity raise', raise.status === 200);
    const confirmed = raise.data.ticket;
    assert('Waiter cannot raise a quantity while confirming', confirmed.items.find(l => l.dishId === 'dish-5').qty === 2);
    assert('Confirmed items move onto the bill', confirmed.items.length === 2 && confirmed.total > 0 && confirmed.pendingItems.length === 0);
    assert('Confirmed order goes to the kitchen as New', confirmed.status === 'New');

    // 4. Add-on rounds
    console.log('\n--- 4. Add-on rounds ---');
    const round2 = await api('POST', '/api/broadcast', {
      type: 'NEW_ORDER', senderDeviceId: device(), tableToken: tok,
      order: { restaurantId: 'REST-001', table: `Table ${T}`, items: [karahi, kabab, { dishId: 'dish-1', title: 'Chicken Makhni Karahi', qty: 1, notes: 'extra spicy' }] }
    });
    assert('Re-sending the whole cart only adds the new dish', round2.status === 200 &&
      round2.data.order.pendingItems.length === 1 && round2.data.order.pendingItems[0].notes === 'extra spicy', JSON.stringify(round2.data.order && round2.data.order.pendingItems));
    assert('Round 2 joins the same ticket', round2.data.order.ticketId === ticketId);

    const edited = await api('POST', '/api/orders/confirm', { ticketId, lines: [{ lineId: round2.data.order.pendingItems[0].lineId, qty: 0 }] }, waiter);
    assert('Waiter can drop a line while confirming', edited.status === 200 && edited.data.ticket.items.length === 2);

    const round3 = await guestOrder(T, tok, [{ dishId: 'dish-5', title: 'Peshawari Beef Chapli Kabab', qty: 1, notes: 'for the kids' }]);
    assert('Rejecting needs a reason (400)', (await api('POST', '/api/orders/reject', { ticketId }, waiter)).status === 400);
    const rejected = await api('POST', '/api/orders/reject', { ticketId, reason: 'Guest ordered by mistake' }, waiter);
    assert('Waiter rejects round 3 with a reason', round3.status === 200 && rejected.status === 200);
    assert('Guest sees why the round was not accepted', rejected.data.ticket.notices.some(n => /not accepted/i.test(n.text)));

    // 5. Status rules
    console.log('\n--- 5. Status rules ---');
    const toKitchen = await api('POST', '/api/broadcast', { type: 'STATUS_UPDATE', ticketId, status: 'In Kitchen' }, waiter);
    assert('Waiter moves order forward to In Kitchen', toKitchen.status === 200);
    assert('Order cannot move backwards (409)',
      (await api('POST', '/api/broadcast', { type: 'STATUS_UPDATE', ticketId, status: 'New' }, waiter)).status === 409);
    assert('Settled cannot be set through a status update',
      (await api('POST', '/api/broadcast', { type: 'STATUS_UPDATE', ticketId, status: 'Settled' }, waiter)).status >= 400);

    // 6. Removing a confirmed item
    console.log('\n--- 6. Removing confirmed items ---');
    const ticketNow = (await api('GET', `/api/public/table-ticket?table=${T}&t=${tok}`)).data.tickets.find(t => t.ticketId === ticketId);
    const karahiLine = ticketNow.items.find(l => l.dishId === 'dish-1' && !l.voided);
    assert('Removal after the kitchen started needs a manager PIN (403)',
      (await api('POST', '/api/orders/remove-line', { ticketId, lineId: karahiLine.lineId, reason: 'Guest changed mind' }, waiter)).status === 403);
    const removed = await api('POST', '/api/orders/remove-line', { ticketId, lineId: karahiLine.lineId, reason: 'Guest changed mind', managerPin: '7788' }, waiter);
    assert('Removal with the manager PIN succeeds', removed.status === 200, JSON.stringify(removed.data));
    assert('Removed item is taken off the bill', removed.data.ticket.subtotal === ticketNow.subtotal - karahiLine.price * karahiLine.qty);
    assert('Same item cannot be removed twice (409)',
      (await api('POST', '/api/orders/remove-line', { ticketId, lineId: karahiLine.lineId, reason: 'again', managerPin: '7788' }, waiter)).status === 409);

    // 7. Sold out
    console.log('\n--- 7. Sold-out dishes ---');
    await api('POST', '/api/broadcast', { type: 'ITEM_86_UPDATE', soldOutList: ['dish-5'] }, waiter);
    const soldOut = await guestOrder(T, tok, [{ dishId: 'dish-5', title: 'Peshawari Beef Chapli Kabab', qty: 1, notes: 'one more' }]);
    assert('Sold-out dish is refused (409)', soldOut.status === 409);
    await api('POST', '/api/broadcast', { type: 'ITEM_86_UPDATE', soldOutList: [] }, waiter);

    // 8. Settled is locked
    console.log('\n--- 8. Settling locks the order ---');
    await api('POST', '/api/cashier/shift/open', { openingFloat: 1000 }, cashier);
    assert('Waiter cannot settle a bill',
      (await api('POST', '/api/cashier/settle', { ticketId, paymentMethod: 'Card' }, waiter)).status === 401);
    const settle = await api('POST', '/api/cashier/settle', { ticketId, paymentMethod: 'Card' }, cashier);
    assert('Cashier settles the bill', settle.status === 200, JSON.stringify(settle.data));
    assert('Settled order cannot be voided (409)',
      (await api('POST', '/api/orders/void', { ticketId, reason: 'refund', managerPin: '7788' }, waiter)).status === 409);
    assert('Settled order cannot change status (409)',
      (await api('POST', '/api/broadcast', { type: 'STATUS_UPDATE', ticketId, status: 'Served' }, waiter)).status === 409);
    const afterPay = await guestOrder(T, tok, [karahi]);
    assert('Ordering again after paying starts a fresh ticket', afterPay.status === 200 && afterPay.data.order.ticketId !== ticketId);
    await api('POST', '/api/orders/reject', { ticketId: afterPay.data.order.ticketId, reason: 'test cleanup' }, waiter);

    // 9. Table must be opened by a waiter (optional setting)
    console.log('\n--- 9. Waiter opens the table ---');
    await setOrderSettings({ requireTableOpen: true });
    const closedTable = await guestOrder(T, tok, [karahi]);
    assert('With "waiter opens table" on, a closed table cannot order (423)', closedTable.status === 423);
    assert('Waiter opens the table', (await api('POST', '/api/tables/open', { table: T }, waiter)).status === 200);
    const openTable = await guestOrder(T, tok, [karahi]);
    assert('Opened table can order', openTable.status === 200);
    await api('POST', '/api/orders/reject', { ticketId: openTable.data.order.ticketId, reason: 'test cleanup' }, waiter);
    await setOrderSettings({ requireTableOpen: false });

    // 10. Pausing orders and rotating the QR secret
    console.log('\n--- 10. Pause and QR rotation ---');
    await setOrderSettings({ orderingPaused: true, pausedMessage: 'Kitchen closed for prayer' });
    const paused = await guestOrder(T, tok, [karahi]);
    assert('Paused restaurant refuses orders with the owner message', paused.status === 423 && /prayer/.test(paused.data.error));
    const info = await api('GET', '/api/public/info?restaurantId=REST-001');
    assert('Public info tells the menu ordering is paused', info.data.restaurant && info.data.restaurant.ordering && info.data.restaurant.ordering.paused === true);
    await setOrderSettings({ orderingPaused: false });

    assert('Waiters cannot rotate QR secrets', (await api('POST', '/api/tables/rotate-token', { tableId: T }, waiter)).status === 403);
    const rotated = await api('POST', '/api/tables/rotate-token', { tableId: T }, admin);
    assert('Admin rotates the table QR secret', rotated.status === 200 && rotated.data.table.qrToken && rotated.data.table.qrToken !== tok);
    assert('Old QR code stops working', (await guestOrder(T, tok, [karahi])).status === 403);
    assert('Waiters do not receive QR secrets in the table list',
      ((await api('GET', '/api/tables', null, waiter)).data || []).every(t => !t.qrToken));

    // 11. Exceptions report
    console.log('\n--- 11. Exceptions report ---');
    assert('Waiters cannot read the exceptions report', (await api('GET', '/api/reports/exceptions', null, waiter)).status === 403);
    const report = await api('GET', '/api/reports/exceptions', null, admin);
    assert('Exceptions report loads for the owner', report.status === 200);
    const r = report.data.report || { totals: {} };
    assert('Report lists the removed item', r.lineVoids.some(v => v.ticketId === ticketId));
    assert('Report lists the rejected round', r.rejections.some(v => v.ticketId === ticketId));
    assert('Report counts the failed PIN attempt', r.totals.failedPinAttempts >= 1);
    assert('Report breaks removals down per waiter', Array.isArray(r.perWaiter) && r.perWaiter.length > 0);

    await resetTable(T);
  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log(`\nTEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  if (failed > 0) process.exit(1);
}

runTests();
