// 批量注册性能测试用户：perf_user_001 ~ perf_user_100
// 用法：node performance/scripts/setup-test-users.js
const http = require('http');

const BASE = { hostname: 'localhost', port: 3000 };
const COUNT = 100;
const PASSWORD = 'TestPass123';
const BATCH_SIZE = 10; // 并发注册数

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const opts = { ...BASE, method, path, headers: { 'Content-Type': 'application/json' } };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function registerUser(i) {
  const username = `perf_user_${String(i).padStart(3, '0')}`;
  try {
    const res = await request('POST', '/api/auth/register', { username, password: PASSWORD });
    if (res.status === 201) return { username, ok: true };
    if (res.status === 409) return { username, ok: true, existed: true };
    return { username, ok: false, status: res.status, body: res.body };
  } catch (err) {
    return { username, ok: false, error: err.message };
  }
}

async function main() {
  console.log(`开始注册 ${COUNT} 个压测用户...\n`);

  let created = 0, existed = 0, failed = 0;
  for (let i = 1; i <= COUNT; i += BATCH_SIZE) {
    const batch = [];
    for (let j = i; j < i + BATCH_SIZE && j <= COUNT; j++) {
      batch.push(registerUser(j));
    }
    const results = await Promise.all(batch);
    for (const r of results) {
      if (r.ok && r.existed) existed++;
      else if (r.ok) created++;
      else {
        failed++;
        console.error(`  FAIL ${r.username}: ${r.status || r.error}`);
      }
    }
    process.stdout.write(`\r  进度: ${Math.min(i + BATCH_SIZE - 1, COUNT)}/${COUNT}`);
  }

  console.log(`\n\n注册完成: 新建 ${created}, 已存在 ${existed}, 失败 ${failed}`);
  if (failed > 0) process.exit(1);
}

main();
