// Automated Test Suite for Post-Order Reviews, Google Review Prompt & Messages to Owner/Manager
// Run with the server up: node server.js  (then)  node test_guest_feedback.js
const http = require('http');

const BASE_URL = 'http://127.0.0.1:3000';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { ...headers };
    if (body) reqHeaders['Content-Type'] = 'application/json';
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
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting Automated Tests: Guest Reviews & Owner Messages ---');
  let passed = 0;
  let failed = 0;
  function assert(condition, desc) {
    if (condition) { console.log(`\x1b[32m✔ PASS:\x1b[0m ${desc}`); passed++; }
    else { console.error(`\x1b[31m✖ FAIL:\x1b[0m ${desc}`); failed++; }
  }

  const table = '97';
  const ticketId = '#TKT-FB-' + Date.now().toString().slice(-6);
  const hostDevice = 'dev_fb_host_' + Date.now();
  const friendDevice = 'dev_fb_friend_' + Date.now();

  try {
    const ownerLogin = await request('POST', '/api/auth/login', { email: 'owner@deragourmet.com', password: 'DeraAdmin#2026' });
    const ownerAuth = { Authorization: `Bearer ${ownerLogin.data.token}` };
    const cashierLogin = await request('POST', '/api/auth/login', { email: 'cashier@deragourmet.com', password: 'Cashier#2026' });
    const cashierAuth = { Authorization: `Bearer ${cashierLogin.data.token}` };
    assert(ownerLogin.data.token && cashierLogin.data.token, 'Owner and cashier can log in');

    console.log('\n[Test 1] Google review link settings');
    const noAuthSettings = await request('POST', '/api/restaurant/review-settings', { googleReviewUrl: 'https://g.page/r/x/review' });
    assert(noAuthSettings.status === 401, 'Saving review settings requires admin login');
    const badUrl = await request('POST', '/api/restaurant/review-settings', { googleReviewUrl: 'javascript:alert(1)' }, ownerAuth);
    assert(badUrl.status === 400, 'Non-https Google link is rejected');
    const saveSettings = await request('POST', '/api/restaurant/review-settings', { googleReviewUrl: 'https://g.page/r/dera-test/review', googleHighlightMinRating: 4 }, ownerAuth);
    assert(saveSettings.status === 200 && saveSettings.data.settings.googleReviewUrl === 'https://g.page/r/dera-test/review', 'Owner saves Google review link');
    const info = await request('GET', '/api/public/info?restaurantId=REST-001');
    assert(info.data.restaurant.googleReviewUrl === 'https://g.page/r/dera-test/review', 'Public info exposes the Google review link to the customer app');

    console.log('\n[Test 2] Order lifecycle: reviews only open once the order is complete');
    await request('POST', '/api/table-session/join', { table, deviceId: hostDevice, name: 'Ayesha', claimHost: true, forceHost: true });
    const order = await request('POST', '/api/broadcast', {
      type: 'NEW_ORDER',
      senderDeviceId: hostDevice,
      order: { ticketId, restaurantId: 'REST-001', table: `Table ${table}`, guest: 'Ayesha', items: [{ title: 'Chicken Biryani', price: 650, qty: 1 }], status: 'New' }
    });
    assert(order.status === 200, 'Test order created');
    const early = await request('POST', '/api/feedback/review', { restaurantId: 'REST-001', ticketId, deviceId: hostDevice, rating: 5 });
    assert(early.status === 409, 'Review is rejected while the order is still in progress');

    const settle = await request('POST', '/api/cashier/settle', { table: `Table ${table}`, ticketId, paymentMethod: 'Card' }, cashierAuth);
    assert(settle.status === 200, 'Cashier settles the bill (order complete)');

    console.log('\n[Test 3] Submitting reviews');
    const badRating = await request('POST', '/api/feedback/review', { restaurantId: 'REST-001', ticketId, deviceId: hostDevice, rating: 7 });
    assert(badRating.status === 400, 'Rating outside 1-5 is rejected');
    const missingTicket = await request('POST', '/api/feedback/review', { restaurantId: 'REST-001', ticketId: '#TKT-NOPE', deviceId: hostDevice, rating: 4 });
    assert(missingTicket.status === 404, 'Unknown order is rejected');

    const happy = await request('POST', '/api/feedback/review', { restaurantId: 'REST-001', table, ticketId, deviceId: hostDevice, nickname: 'Ayesha', rating: 5, comment: 'Biryani was perfect' });
    assert(happy.status === 200 && happy.data.reviewId, '5-star review saved');
    assert(happy.data.googleReviewUrl === 'https://g.page/r/dera-test/review' && happy.data.highlightGoogle === true, '5-star review gets the highlighted Google prompt');

    const dup = await request('POST', '/api/feedback/review', { restaurantId: 'REST-001', ticketId, deviceId: hostDevice, rating: 1 });
    assert(dup.status === 409, 'Same device cannot review the same order twice');

    const unhappy = await request('POST', '/api/feedback/review', { restaurantId: 'REST-001', table, ticketId, deviceId: friendDevice, nickname: 'Omar', rating: 2, comment: 'Naan was cold' });
    assert(unhappy.status === 200, 'Another guest at the table can review the same order');
    assert(unhappy.data.googleReviewUrl === 'https://g.page/r/dera-test/review' && unhappy.data.highlightGoogle === false,
      'Low rating still gets the Google link (no review gating), just not highlighted');

    const click = await request('POST', '/api/feedback/review/google-click', { reviewId: happy.data.reviewId, deviceId: hostDevice });
    assert(click.status === 200, 'Google link click is recorded');
    const spoofClick = await request('POST', '/api/feedback/review/google-click', { reviewId: happy.data.reviewId, deviceId: 'someone-else' });
    assert(spoofClick.status === 404, 'Another device cannot mark someone else\'s review');

    console.log('\n[Test 4] Messages to the owner/manager');
    const empty = await request('POST', '/api/feedback/message', { restaurantId: 'REST-001', table, deviceId: friendDevice, message: '   ' });
    assert(empty.status === 400, 'Empty message is rejected');
    const msg = await request('POST', '/api/feedback/message', { restaurantId: 'REST-001', table, deviceId: friendDevice, nickname: 'Omar', contact: '0300-1234567', recipient: 'owner', message: 'Our server Hamza was wonderful, please thank him!' });
    assert(msg.status === 200 && msg.data.messageId, 'Guest message addressed to the owner is saved');
    const toManager = await request('POST', '/api/feedback/message', { restaurantId: 'REST-001', table, deviceId: hostDevice, message: 'Could we book this table for Friday?' });
    assert(toManager.status === 200, 'Message with no recipient defaults to the manager');

    const turnOff = await request('POST', '/api/restaurant/review-settings', { ownerMessagesEnabled: false }, ownerAuth);
    assert(turnOff.status === 200 && turnOff.data.settings.ownerMessagesEnabled === false, 'Restaurant admin turns guest messages off');
    assert(turnOff.data.settings.googleReviewUrl === 'https://g.page/r/dera-test/review', 'Turning messages off keeps the Google link');
    const infoOff = await request('GET', '/api/public/info?restaurantId=REST-001');
    assert(infoOff.data.restaurant.ownerMessagesEnabled === false, 'Customer app sees messages are off');
    const blocked = await request('POST', '/api/feedback/message', { restaurantId: 'REST-001', table, deviceId: 'dev_x', message: 'hello' });
    assert(blocked.status === 403, 'Messages are rejected while switched off');
    const turnOn = await request('POST', '/api/restaurant/review-settings', { ownerMessagesEnabled: true }, ownerAuth);
    assert(turnOn.data.settings.ownerMessagesEnabled === true, 'Restaurant admin turns guest messages back on');

    let limited = null;
    for (let i = 0; i < 5; i++) {
      limited = await request('POST', '/api/feedback/message', { restaurantId: 'REST-001', table, deviceId: friendDevice, message: 'spam ' + i });
    }
    assert(limited.status === 429, 'Message flooding from one device is rate-limited');

    console.log('\n[Test 5] Owner inbox privacy');
    const anonInbox = await request('GET', '/api/feedback');
    assert(anonInbox.status === 401, 'Inbox requires admin login');
    const cashierInbox = await request('GET', '/api/feedback', null, cashierAuth);
    assert(cashierInbox.status === 401, 'Cashier cannot read the owner inbox');
    const publicDb = await request('GET', '/api/db');
    assert(publicDb.data.reviews === undefined && publicDb.data.ownerMessages === undefined, 'Public /api/db does not leak reviews or messages');

    const inbox = await request('GET', '/api/feedback', null, ownerAuth);
    assert(inbox.status === 200, 'Owner reads the inbox');
    const ourReviews = inbox.data.reviews.filter(r => r.ticketId === ticketId);
    assert(ourReviews.length === 2, 'Both reviews for the order are listed');
    assert(ourReviews.every(r => r.deviceId === undefined), 'Device IDs are not exposed in the inbox');
    assert(ourReviews.some(r => r.googleClicked), 'Google click shows in the inbox');
    const ourMsg = inbox.data.messages.find(m => m.id === msg.data.messageId);
    assert(ourMsg && ourMsg.contact === '0300-1234567' && ourMsg.table === 'Table 97' && ourMsg.read === false, 'Message shows with contact, table and unread state');
    assert(ourMsg.recipient === 'owner', 'Message shows it was sent to the owner');
    const mgrMsg = inbox.data.messages.find(m => m.id === toManager.data.messageId);
    assert(mgrMsg && mgrMsg.recipient === 'manager', 'Default message shows it was sent to the manager');
    assert(inbox.data.summary.reviewCount >= 2 && inbox.data.summary.unreadMessages >= 1, 'Summary counts reviews and unread messages');

    const markRead = await request('POST', '/api/feedback/message/read', { messageId: msg.data.messageId }, ownerAuth);
    assert(markRead.status === 200, 'Owner marks message as read');
    const inbox2 = await request('GET', '/api/feedback', null, ownerAuth);
    assert(inbox2.data.messages.find(m => m.id === msg.data.messageId).read === true, 'Message is now read');
  } catch (e) {
    console.error('Test run crashed:', e);
    failed++;
  }

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  process.exit(failed ? 1 : 0);
}

runTests();
