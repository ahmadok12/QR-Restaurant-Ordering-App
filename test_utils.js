// Shared helpers for the test suites (run them through run_tests.js)
const http = require('http');

const BASE_URL = 'http://localhost:3000';
const DEMO_ADMIN = { email: 'owner@deragourmet.com', password: 'DeraAdmin#2026' };

function api(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const postData = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } : {}),
        ...headers
      }
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

const bearer = token => ({ 'Authorization': `Bearer ${token}` });

let cachedAdminToken = null;
async function adminToken() {
  if (!cachedAdminToken) {
    const r = await api('POST', '/api/auth/login', DEMO_ADMIN);
    cachedAdminToken = r.data.token;
  }
  return cachedAdminToken;
}

// Returns the QR secret for a table, creating the table first if it is not on the floor plan.
async function tableToken(tableId) {
  const id = String(tableId).padStart(2, '0');
  const headers = bearer(await adminToken());
  let tables = (await api('GET', '/api/tables', null, headers)).data || [];
  if (!tables.find(t => t.id === id)) {
    await api('POST', '/api/tables', { id, name: `Table ${id}`, zone: 'Main Hall', capacity: 4 }, headers);
    tables = (await api('GET', '/api/tables', null, headers)).data || [];
  }
  return (tables.find(t => t.id === id) || {}).qrToken;
}

async function setOrderSettings(settings) {
  return api('POST', '/api/restaurant/order-settings', settings, bearer(await adminToken()));
}

async function resetTable(tableId) {
  return api('POST', '/api/test/reset-table', { table: String(tableId) }, bearer(await adminToken()));
}

module.exports = { api, bearer, adminToken, tableToken, setOrderSettings, resetTable, BASE_URL };
