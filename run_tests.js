// Runs every test suite against a fresh, throwaway database so tests never touch real data.
// Usage: node run_tests.js
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const SUITES = [
  'test_fraud_controls.js',
  'test_table_layouts.js',
  'test_billing_and_deals.js',
  'test_multi_person_ordering.js',
  'test_cohost_realtime_sync.js',
  'test_names_and_notifications.js',
  'test_waiter_app_toggle.js',
  'test_order_controls.js',
  'test_reports_and_feedback.js',
  'test_review_regressions.js',
  'test_security.js' // last: it trips the manager PIN lockout
];

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-pos-test-'));
const dbFile = path.join(tmpDir, 'pos_db.json');
const env = { ...process.env, PORT: '3000', DB_FILE: dbFile };
delete env.AUTH_SECRET;

function waitForServer(retries = 50) {
  return new Promise((resolve, reject) => {
    const attempt = n => {
      http.get('http://localhost:3000/api/public/info', res => {
        res.resume();
        resolve();
      }).on('error', () => {
        if (n <= 0) return reject(new Error('Server did not start on port 3000'));
        setTimeout(() => attempt(n - 1), 200);
      });
    };
    attempt(retries);
  });
}

function runSuite(file) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(__dirname, file)], { env, stdio: 'inherit' });
    child.on('exit', code => resolve(code === 0));
  });
}

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: ['ignore', 'ignore', 'inherit'] });
  let failures = [];
  try {
    await waitForServer();
    for (const suite of SUITES) {
      console.log(`\n>>> ${suite}`);
      if (!(await runSuite(suite))) failures.push(suite);
    }
  } catch (err) {
    console.error(err.message);
    failures.push('server startup');
  } finally {
    server.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log(failures.length ? `\nFAILED: ${failures.join(', ')}` : '\nAll test suites passed.');
  process.exit(failures.length ? 1 : 0);
})();
