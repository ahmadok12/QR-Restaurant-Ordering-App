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
  console.log('    TABLE LAYOUT & VISUAL FLOOR PLAN TEST SUITE     ');
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
    // 1. PUBLIC INFO WITH TABLE ATTRIBUTES
    console.log('--- 1. Public Info Table Metadata ---');
    const pubRes = await request('/api/public/info?restaurantId=rest-dera-01');
    assert('Public info returns 200', pubRes.status === 200);
    assert('Public info includes sections list', Array.isArray(pubRes.data.sections) && pubRes.data.sections.length > 0);
    assert('Public info includes tables array', Array.isArray(pubRes.data.tables) && pubRes.data.tables.length > 0);
    const firstTable = pubRes.data.tables[0];
    assert('Tables include seating capacity', typeof firstTable.capacity === 'number');
    assert('Tables include shape attribute', typeof firstTable.shape === 'string');
    assert('Tables include x, y coordinates', typeof firstTable.x === 'number' && typeof firstTable.y === 'number');

    // 2. ADMIN AUTHENTICATION FOR TABLE APIs
    console.log('\n--- 2. RBAC Table Management Protection ---');
    const unauthAdd = await request('/api/tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { name: 'Unauthorized Table', zone: 'Main Dining' }
    });
    assert('Unauthenticated table creation rejected with 403', unauthAdd.status === 403);

    // Login as Restaurant Admin
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'owner@deragourmet.com', password: 'DeraAdmin#2026' }
    });
    assert('Restaurant Admin login succeeds (200)', loginRes.status === 200 && loginRes.data.token);
    const adminToken = loginRes.data.token;
    const adminHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    };

    // 3. SECTIONS MANAGEMENT
    console.log('\n--- 3. Dining Section Creation ---');
    const addSecRes = await request('/api/sections', {
      method: 'POST',
      headers: adminHeaders,
      body: { name: 'Rooftop Skylight' }
    });
    assert('Admin creates new section (200)', addSecRes.status === 200);
    assert('Sections list includes new section', addSecRes.data.sections && addSecRes.data.sections.includes('Rooftop Skylight'));

    // 4. TABLE CREATION WITH CUSTOM ATTRIBUTES
    console.log('\n--- 4. Table Customization & Attributes ---');
    const testTableId = '99';
    const addTableRes = await request('/api/tables', {
      method: 'POST',
      headers: adminHeaders,
      body: {
        id: testTableId,
        name: 'VIP Cabin 99',
        zone: 'Rooftop Skylight',
        capacity: 8,
        shape: 'booth',
        x: 75,
        y: 75
      }
    });
    assert('Admin creates custom table (200)', addTableRes.status === 200 && addTableRes.data.ok);
    const createdTable = addTableRes.data.table;
    assert('Created table has correct name', createdTable.name === 'VIP Cabin 99');
    assert('Created table has correct zone', createdTable.zone === 'Rooftop Skylight');
    assert('Created table has capacity 8', createdTable.capacity === 8);
    assert('Created table has shape booth', createdTable.shape === 'booth');
    assert('Created table has coordinates x=75, y=75', createdTable.x === 75 && createdTable.y === 75);

    // 5. BATCH LAYOUT POSITIONING (DRAG & DROP PERSISTENCE)
    console.log('\n--- 5. Batch Drag-and-Drop Layout Updates ---');
    const layoutRes = await request('/api/tables/layout', {
      method: 'POST',
      headers: adminHeaders,
      body: {
        positions: [
          { id: testTableId, x: 82, y: 88 }
        ]
      }
    });
    assert('Batch layout position update succeeds (200)', layoutRes.status === 200 && layoutRes.data.ok);

    const getTablesRes = await request('/api/tables');
    const updatedTable = (getTablesRes.data || []).find(t => t.id === testTableId);
    assert('Table coordinates updated to x=82, y=88', updatedTable && updatedTable.x === 82 && updatedTable.y === 88);

    // 6. OCCUPANCY GUARD ON DELETE
    console.log('\n--- 6. Table Deletion & Active Order Guard ---');
    const occupiedTable = (getTablesRes.data || []).find(t => t.status === 'dining' || (t.order && t.order.ticketId));
    if (occupiedTable) {
      const deleteOccupied = await request(`/api/tables/${occupiedTable.id}`, {
        method: 'DELETE',
        headers: adminHeaders
      });
      assert('Deleting occupied table blocked with 400 Bad Request', deleteOccupied.status === 400);
      assert('Error explains table is occupied with active order', deleteOccupied.data.error && deleteOccupied.data.error.includes('active'));
    }

    // Delete the test table 99 (vacant)
    const deleteVacant = await request(`/api/tables/${testTableId}`, {
      method: 'DELETE',
      headers: adminHeaders
    });
    assert('Deleting vacant table succeeds with 200', deleteVacant.status === 200 && deleteVacant.data.ok);

    const checkDeleted = await request('/api/tables');
    const stillExists = (checkDeleted.data || []).some(t => t.id === testTableId);
    assert('Table 99 removed from database', !stillExists);

  } catch (err) {
    console.error('Unexpected test error:', err);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
