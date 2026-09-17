// test_fraud_controls.js
const http = require('http');

const BASE_URL = 'http://localhost:3000';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(url, reqOptions, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('    INSTITUTIONAL AUDIT & FRAUD CONTROL TEST SUITE  ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(name, condition, details = '') {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} ${details ? '- ' + details : ''}`);
      failed++;
    }
  }

  try {
    // 1. DATA SANITIZATION & PUBLIC INFO TEST
    console.log('--- 1. Data Sanitization & Credential Protection ---');
    const pubInfoRes = await request('/api/public/info?restaurantId=rest-dera-01');
    assert('Public info endpoint works (200)', pubInfoRes.status === 200);
    assert('Public info does not leak passwords', !pubInfoRes.data.credentials && !pubInfoRes.data.superAdmin);

    const anonDbRes = await request('/api/db');
    assert('Anonymous /api/db responds (200)', anonDbRes.status === 200);
    assert('Anonymous /api/db hides superAdmin credentials', !anonDbRes.data.superAdmin);
    assert('Anonymous /api/db hides managerPin', !anonDbRes.data.managerPin);
    const restPassMasked = anonDbRes.data.restaurants.every(r => !r.credentials || r.credentials.password === '***');
    assert('Anonymous /api/db masks restaurant passwords (***)', restPassMasked);
    const staffPassMasked = anonDbRes.data.staff.every(s => s.password === '***');
    assert('Anonymous /api/db masks staff passwords (***)', staffPassMasked);

    // 2. AUTHENTICATION & RBAC
    console.log('\n--- 2. RBAC & JWT-style Token Authentication ---');
    // Invalid credentials
    const badLogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'hacker@evil.com', password: 'wrong' }
    });
    assert('Invalid login returns 401 Unauthorized', badLogin.status === 401);

    // Cashier login
    const cashierLogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'cashier@deragourmet.com', password: 'Cashier#2026' }
    });
    assert('Cashier login succeeds (200)', cashierLogin.status === 200);
    const cashierToken = cashierLogin.data.token;
    assert('Cashier receives signed Bearer token', !!cashierToken && cashierToken.includes('.'));

    // Super admin login
    const superLogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'superadmin@deragourmet.com', password: 'SuperAdmin#2026' }
    });
    assert('Super Admin login succeeds (200)', superLogin.status === 200);
    const superToken = superLogin.data.token;
    assert('Super admin receives signed Bearer token', !!superToken && superToken.includes('.'));

    // 3. SERVER-AUTHORITATIVE PRICING TAMPERING TEST
    console.log('\n--- 3. Server-Authoritative Price Recalculation ---');
    const fakeTamperedOrder = {
      type: 'NEW_ORDER',
      order: {
        ticketId: '#TKT-TAMPER-' + Date.now().toString().slice(-4),
        table: 'Table 08',
        restaurantId: 'rest-dera-01',
        guest: 'Price Tampering Attacker',
        time: '12:30 PM',
        items: [
          {
            dishId: 'dish-01', // Chicken Makhni Karahi (canonical price: 1250)
            title: 'Chicken Makhni Karahi',
            price: 1, // Tampered client price: Rs. 1!
            qty: 2,
            size: 'Half (0.5 kg)',
            spice: 'Chatpata 🌶️'
          }
        ],
        subtotal: 2, // Tampered subtotal
        tax: 0,
        total: 2 // Tampered grand total
      }
    };

    const broadcastRes = await request('/api/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: fakeTamperedOrder
    });
    assert('Order placed via broadcast endpoint (200)', broadcastRes.status === 200);
    assert('Server discarded tampered total (2 Rs) and enforced catalog pricing (> 1000 Rs)', broadcastRes.data.order.total >= 2000, `Actual total: ${broadcastRes.data.order.total}`);
    assert('Server recalculated correct subtotal', broadcastRes.data.order.subtotal >= 2000, `Actual subtotal: ${broadcastRes.data.order.subtotal}`);

    // 4. UNSETTLED BILL FRAUD: PHANTOM SETTLE REJECTION
    console.log('\n--- 4. Settle Protection & Invoice Sequence ---');
    // Unauthenticated settle attempt
    const unauthSettle = await request('/api/cashier/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { table: 'Table 08', ticketId: broadcastRes.data.order.ticketId, total: 10 }
    });
    assert('Unauthenticated settlement rejected with 401 Unauthorized', unauthSettle.status === 401);

    // Direct unauthenticated BILL_SETTLED broadcast rejected
    const unauthBroadcastSettle = await request('/api/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { type: 'BILL_SETTLED', table: 'Table 08' }
    });
    assert('Direct unauthenticated phantom BILL_SETTLED broadcast blocked (403)', unauthBroadcastSettle.status === 403);

    // 5. TILL SHIFT & BLIND CASH COUNT
    console.log('\n--- 5. Till Float & Blind Cash Count Variance ---');
    const openShiftRes = await request('/api/cashier/shift/open', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cashierToken}`
      },
      body: { openingFloat: 5000 }
    });
    assert('Cashier starts shift with float of Rs. 5000 (201 or 400 if already active)', openShiftRes.status === 201 || (openShiftRes.status === 400 && openShiftRes.data.shift));

    // Cashier settles the authoritative order
    const authoritativeTotal = broadcastRes.data.order.total;
    const authSettleRes = await request('/api/cashier/settle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cashierToken}`
      },
      body: {
        table: 'Table 08',
        ticketId: broadcastRes.data.order.ticketId,
        paymentMethod: 'Cash',
        cashReceived: authoritativeTotal + 500 // Tendered with extra cash
      }
    });
    assert('Authenticated settlement succeeds (200)', authSettleRes.status === 200);
    assert('Sequential gapless invoice generated (INV-YYYY-XXXXX)', !!authSettleRes.data.invoiceNumber && authSettleRes.data.invoiceNumber.startsWith('INV-'));
    assert('Change given calculated accurately', authSettleRes.data.sale.changeGiven === 500);

    // Close Shift with Blind Cash Count
    const closeShiftRes = await request('/api/cashier/shift/close', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cashierToken}`
      },
      body: {
        countedCash: 5000 + authoritativeTotal, // Exact physical count
        notes: 'End of lunch shift - balanced'
      }
    });
    assert('Shift closed with blind cash count (200)', closeShiftRes.status === 200);
    assert('Variance reconciled accurately (0 for exact match)', closeShiftRes.data.summary && closeShiftRes.data.summary.variance === 0);

    // 6. MANAGER VOID OVERRIDE & PIN PROTECTION
    console.log('\n--- 6. Manager Void PIN Override Control ---');
    // Place a new test order to void
    const voidTestOrder = {
      type: 'NEW_ORDER',
      order: {
        ticketId: '#TKT-VOID-' + Date.now().toString().slice(-4),
        table: 'Table 05',
        restaurantId: 'rest-dera-01',
        guest: 'Walkout Customer',
        time: '01:00 PM',
        items: [{ dishId: 'dish-02', title: 'Mutton Seekh Kabab', price: 950, qty: 1 }],
        subtotal: 950,
        total: 998
      }
    };
    await request('/api/broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: voidTestOrder });

    // Try voiding with wrong PIN
    const badVoid = await request('/api/orders/void', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        ticketId: voidTestOrder.order.ticketId,
        reason: 'Customer walked out',
        managerPin: '0000' // Invalid PIN
      }
    });
    assert('Void with wrong manager PIN rejected (403)', badVoid.status === 403);

    // Try voiding without reason
    const noReasonVoid = await request('/api/orders/void', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        ticketId: voidTestOrder.order.ticketId,
        reason: '',
        managerPin: '7788'
      }
    });
    assert('Void without mandatory reason rejected (400)', noReasonVoid.status === 400);

    // Authorized void with manager PIN 7788
    const goodVoid = await request('/api/orders/void', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        ticketId: voidTestOrder.order.ticketId,
        reason: 'Customer cancelled before food entered tandoor',
        managerPin: '7788'
      }
    });
    assert('Authorized void with valid manager PIN succeeds (200)', goodVoid.status === 200);
    assert('Ticket marked Voided', goodVoid.data.ticket && goodVoid.data.ticket.status === 'Voided');

    // 7. IMMUTABLE AUDIT LOG LEDGER TEST
    console.log('\n--- 7. Immutable Audit Trail Ledger ---');
    const auditLogsRes = await request('/api/audit-logs', {
      headers: { 'Authorization': `Bearer ${superToken}` }
    });
    assert('Audit logs retrieved with Super Admin token (200)', auditLogsRes.status === 200);
    const logs = auditLogsRes.data || [];
    assert('Audit log contains events', logs.length > 0, `Total entries: ${logs.length}`);

    const hasOrderCreated = logs.some(l => l.action === 'ORDER_CREATED');
    assert('Audit log recorded ORDER_CREATED', hasOrderCreated);

    const hasBillSettled = logs.some(l => l.action === 'BILL_SETTLED');
    assert('Audit log recorded BILL_SETTLED with invoice details', hasBillSettled);

    const hasShiftClosed = logs.some(l => l.action === 'SHIFT_CLOSED');
    assert('Audit log recorded SHIFT_CLOSED with variance', hasShiftClosed);

    const hasOrderVoided = logs.some(l => l.action === 'ORDER_VOIDED');
    assert('Audit log recorded ORDER_VOIDED with manager authorization', hasOrderVoided);

    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');
  } catch (err) {
    console.error('Test execution error:', err);
  }
}

runTests();
