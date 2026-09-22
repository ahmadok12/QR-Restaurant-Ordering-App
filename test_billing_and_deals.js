// Automated Test Suite for Billing Charges, Taxes, and Menu Deals Builder
const http = require('http');

const BASE_URL = 'http://127.0.0.1:3000';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { ...headers };
    if (body) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting Automated Tests: Billing Charges & Deals Builder ---');
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

  try {
    // 1. Test GET /api/restaurant/billing-settings
    console.log('\n[Test 1] GET /api/restaurant/billing-settings');
    const getRes = await request('GET', '/api/restaurant/billing-settings?restaurantId=REST-001');
    assert(getRes.status === 200, 'GET /api/restaurant/billing-settings returns 200');
    assert(Array.isArray(getRes.data.billingCharges), 'billingCharges is an array');
    assert(['Rs.', 'Rs', 'PKR'].includes(getRes.data.currency), 'currency returned');

    // 2. Test POST /api/restaurant/billing-settings with percentage & fixed charges
    console.log('\n[Test 2] POST /api/restaurant/billing-settings');
    const testCharges = [
      {
        id: 'chg_pra_tax',
        name: 'PRA Sales Tax',
        type: 'percentage',
        rate: 16,
        enabled: true,
        category: 'tax'
      },
      {
        id: 'chg_ac_service',
        name: 'AC & Ambience Surcharge',
        type: 'fixed',
        rate: 150,
        enabled: true,
        category: 'service'
      }
    ];
    const postRes = await request('POST', '/api/restaurant/billing-settings', {
      restaurantId: 'REST-001',
      billingCharges: testCharges
    });
    assert(postRes.status === 200 && postRes.data.ok === true, 'Billing settings updated successfully');
    assert(postRes.data.taxRate === 16, 'Primary taxRate updated from tax category charge');

    // 3. Verify updated settings via GET
    console.log('\n[Test 3] Verify persisted settings via GET /api/restaurant/billing-settings');
    const verifyGet = await request('GET', '/api/restaurant/billing-settings?restaurantId=REST-001');
    assert(verifyGet.data.billingCharges.length === 2, '2 billing charges stored');
    assert(verifyGet.data.billingCharges.find(c => c.id === 'chg_pra_tax').rate === 16, 'PRA Tax rate is 16%');
    assert(verifyGet.data.billingCharges.find(c => c.id === 'chg_ac_service').rate === 150, 'AC service fee is fixed 150');

    // 4. Test Authoritative Order Calculation via /api/broadcast
    console.log('\n[Test 4] Authoritative Order Calculation with configured charges');
    // Fetch menu to get valid dish ID
    const menuRes = await request('GET', '/api/menu?restaurantId=REST-001');
    const sampleDish = menuRes.data.find(d => d.id === 'd1' || d.id === 'd-karahi') || menuRes.data[0];
    assert(sampleDish != null, 'Catalog dish found for order test');

    const testOrder = {
      ticketId: '#TKT-TEST-BILLING',
      table: 'Table 04',
      guest: 'Billing Tester',
      items: [
        {
          id: sampleDish.id,
          dishId: sampleDish.id,
          title: sampleDish.title,
          price: sampleDish.price,
          qty: 2
        }
      ]
    };

    const broadcastRes = await request('POST', '/api/broadcast', {
      type: 'NEW_ORDER',
      order: testOrder
    });
    assert(broadcastRes.status === 200, 'Order broadcast accepted');
    const calcOrder = broadcastRes.data.order;
    assert(calcOrder != null, 'Server returned recalculated order');
    
    const expectedSubtotal = sampleDish.price * 2;
    const expectedTax = Math.round(expectedSubtotal * 0.16);
    const expectedService = 150;
    const expectedTotal = expectedSubtotal + expectedTax + expectedService;

    assert(calcOrder.subtotal === expectedSubtotal, `Subtotal matches: ${calcOrder.subtotal} === ${expectedSubtotal}`);
    assert(calcOrder.tax === expectedTax, `Tax matches 16%: ${calcOrder.tax} === ${expectedTax}`);
    assert(calcOrder.serviceCharge === expectedService, `Service charge matches fixed 150: ${calcOrder.serviceCharge} === ${expectedService}`);
    assert(calcOrder.total === expectedTotal, `Total matches sum of subtotal + charges: ${calcOrder.total} === ${expectedTotal}`);
    assert(Array.isArray(calcOrder.charges) && calcOrder.charges.length === 2, 'Itemized charges returned in order ticket');

    // 5. Test "Make Deals" Combo Creation via POST /api/menu
    console.log('\n[Test 5] Make Deals Combo Creation via POST /api/menu');
    const newDeal = {
      restaurantId: 'REST-001',
      title: 'Mega Feast Duo Combo',
      category: 'deals',
      station: 'karahi',
      price: 2499,
      regularPrice: 3200,
      dealBadge: 'Save Rs. 701 (22% OFF)',
      discountPercent: 22,
      dealItems: [
        { dishId: sampleDish.id, title: sampleDish.title, qty: 1, unitPrice: sampleDish.price }
      ],
      desc: `Combo includes: 1x ${sampleDish.title}. Special limited-time deal price!`,
      image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
      dietary: 'Chef Combo Special',
      prepTime: '20-25 mins'
    };

    const dealCreateRes = await request('POST', '/api/menu', newDeal);
    assert((dealCreateRes.status === 200 || dealCreateRes.status === 201) && dealCreateRes.data.ok === true, 'Deal created successfully');
    const createdDish = dealCreateRes.data.dish;
    assert(createdDish.category === 'deals', 'Dish category is deals');
    assert(Array.isArray(createdDish.dealItems) && createdDish.dealItems.length === 1, 'dealItems stored');
    assert(createdDish.dealBadge === 'Save Rs. 701 (22% OFF)', 'dealBadge preserved');

    // 6. Test GET /api/menu?category=deals
    console.log('\n[Test 6] Verify Deal in Deals category');
    const dealsMenuRes = await request('GET', '/api/menu?restaurantId=REST-001&category=deals');
    assert(dealsMenuRes.status === 200, 'GET /api/menu?category=deals returns 200');
    const foundDeal = dealsMenuRes.data.find(d => d.title === 'Mega Feast Duo Combo');
    assert(foundDeal != null, 'Newly created deal found in deals menu');
    assert(foundDeal.price === 2499, 'Deal promo price is 2499');
    assert(foundDeal.regularPrice === 3200, 'Deal regularPrice is 3200');

    // 7. Verify /api/public/info contains billingCharges
    console.log('\n[Test 7] GET /api/public/info includes billingCharges');
    const infoRes = await request('GET', '/api/public/info?restaurantId=REST-001');
    assert(infoRes.status === 200, 'GET /api/public/info returns 200');
    assert(Array.isArray(infoRes.data.billingCharges), 'public info contains billingCharges array');
    assert(infoRes.data.billingCharges.length === 2, 'public info has both charges');
    // Cleanup: Reset test table 04 after test run
    await request('POST', '/api/test/reset-table', {
      table: '04',
      restaurantId: 'REST-001'
    });

    console.log(`\n========================================`);
    console.log(`RESULTS: Passed: ${passed}, Failed: ${failed}`);
    console.log(`========================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
