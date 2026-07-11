// A5 性能测试运行器
// 支持 k6 兼容的梯形负载模式，输出 JSON 指标报告
// 用法：
//   node performance/scripts/run-perf-test.js --scenario=login --vus=50 --duration=600 --rampup=10 --rampdown=50
//   node performance/scripts/run-perf-test.js --scenario=public --vus=100
//   node performance/scripts/run-perf-test.js --scenario=auth --vus=200
const http = require('http');
const fs = require('fs');
const path = require('path');

// ========== 命令行参数解析 ==========
const args = {};
process.argv.slice(2).forEach(arg => {
  const [k, v] = arg.replace(/^--/, '').split('=');
  args[k] = isNaN(Number(v)) ? v : Number(v);
});

const SCENARIO = args.scenario || 'login';
const TARGET_VUS = args.vus || 50;
const DURATION_SEC = args.duration || 600;    // 10 分钟
const RAMPUP_SEC = args.rampup || Math.ceil(TARGET_VUS / 5);  // 5 用户/秒
const RAMPDOWN_SEC = args.rampdown || Math.ceil(TARGET_VUS / 5);
const BASE_URL = args.url || 'http://localhost:3000';
const USER_COUNT = 100;

// 解析 URL
const urlObj = new URL(BASE_URL);

// ========== HTTP 工具 ==========
function httpRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    const opts = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      method,
      path,
      headers: { 'Content-Type': 'application/json', ...headers },
      timeout: 30000,
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const duration = Date.now() - start;
        let body;
        try { body = JSON.parse(data); } catch { body = data; }
        resolve({ status: res.statusCode, body, duration });
      });
    });
    req.on('error', (err) => {
      resolve({ status: 0, body: null, duration: Date.now() - start, error: err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, body: null, duration: Date.now() - start, error: 'timeout' });
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ========== 用户池 ==========
function buildUserPool() {
  const users = [];
  for (let i = 1; i <= USER_COUNT; i++) {
    users.push(`perf_user_${String(i).padStart(3, '0')}`);
  }
  return users;
}

// ========== 梯形负载调度器 ==========
function calcVus(elapsedSec) {
  if (elapsedSec <= 0) return 1;  // 第一秒至少 1 个 VU
  if (elapsedSec < RAMPUP_SEC) {
    // ramp-up: 线性增长
    return Math.max(1, Math.ceil((elapsedSec / RAMPUP_SEC) * TARGET_VUS));
  }
  const steadyEnd = RAMPUP_SEC + DURATION_SEC;
  if (elapsedSec < steadyEnd) {
    // steady: 保持
    return TARGET_VUS;
  }
  const rampdownEnd = steadyEnd + RAMPDOWN_SEC;
  if (elapsedSec < rampdownEnd) {
    // ramp-down: 线性下降
    const progress = (elapsedSec - steadyEnd) / RAMPDOWN_SEC;
    return Math.max(1, Math.ceil(TARGET_VUS * (1 - progress)));
  }
  return 0;
}

// ========== 场景执行器 ==========
const userPool = buildUserPool();

async function scenarioLogin(vuIndex) {
  const username = userPool[vuIndex % userPool.length];
  const res = await httpRequest('POST', '/api/auth/login', { username, password: 'TestPass123' });
  const ok = res.status === 200 && res.body?.success === true;
  return { ...res, tag: 'POST /api/auth/login', ok };
}

async function scenarioPublic(vuIndex) {
  const endpoints = [
    { path: '/api/health', tag: 'GET /api/health' },
    { path: '/api/doctors', tag: 'GET /api/doctors' },
    { path: '/api/articles', tag: 'GET /api/articles' },
    { path: '/api/articles', tag: 'GET /api/articles' },
    { path: '/api/diabetes-types', tag: 'GET /api/diabetes-types' },
    { path: '/api/articles', tag: 'GET /api/articles' },
    { path: '/api/articles', tag: 'GET /api/articles' },
    { path: '/api/doctors', tag: 'GET /api/doctors' },
    { path: '/api/diabetes-types', tag: 'GET /api/diabetes-types' },
  ];
  // 权重 1:2:4:2 = health:doctors:articles:diabetes
  const ep = endpoints[vuIndex % endpoints.length];
  const res = await httpRequest('GET', ep.path);
  const ok = res.status === 200 && res.body?.success === true;
  return { ...res, tag: ep.tag, ok };
}

async function scenarioAuth(vuIndex) {
  const username = userPool[vuIndex % userPool.length];

  // Step 1: 登录
  const login = await httpRequest('POST', '/api/auth/login', { username, password: 'TestPass123' });
  if (login.status !== 200 || !login.body?.data?.token) {
    return { ...login, tag: 'POST /api/auth/login', ok: false };
  }
  const token = login.body.data.token;
  const authHeaders = { Authorization: `Bearer ${token}` };

  // Step 2: 用户资料
  const profile = await httpRequest('GET', '/api/user/profile', null, authHeaders);

  // Step 3: 风险历史
  const history = await httpRequest('GET', '/api/risk/history?page=1&pageSize=5', null, authHeaders);

  return {
    tag: 'authenticated-flow',
    ok: login.status === 200 && profile.status === 200 && history.status === 200,
    steps: [
      { tag: 'POST /api/auth/login', duration: login.duration, status: login.status },
      { tag: 'GET /api/user/profile', duration: profile.duration, status: profile.status },
      { tag: 'GET /api/risk/history', duration: history.duration, status: history.status },
    ],
    duration: login.duration + profile.duration + history.duration,
    status: history.status,
  };
}

const SCENARIOS = {
  login: scenarioLogin,
  public: scenarioPublic,
  auth: scenarioAuth,
};

// ========== 主循环（持续并发池模型）==========
async function main() {
  const TOTAL_SEC = RAMPUP_SEC + DURATION_SEC + RAMPDOWN_SEC;
  const scenarioFn = SCENARIOS[SCENARIO];
  if (!scenarioFn) {
    console.error(`未知场景: ${SCENARIO}。可选: login, public, auth`);
    process.exit(1);
  }

  console.log(`=== A5 性能测试 ===`);
  console.log(`场景: ${SCENARIO}`);
  console.log(`目标并发: ${TARGET_VUS} VUs`);
  console.log(`Ramp-up: ${RAMPUP_SEC}s | Steady: ${DURATION_SEC}s | Ramp-down: ${RAMPDOWN_SEC}s`);
  console.log(`总时长: ${TOTAL_SEC}s (~${(TOTAL_SEC / 60).toFixed(1)} min)`);
  console.log(`目标地址: ${BASE_URL}\n`);

  // 指标收集
  const allResults = [];
  const timeline = [];
  let completed = 0;
  let succeeded = 0;
  let failed = 0;
  let vuCounter = 0;
  const tagStats = {};
  let isRunning = true;

  const startTime = Date.now();

  // 并发池：持续发射请求，通过 activeCount 控制并发数
  let activeCount = 0;
  let desiredVus = 1;

  function launchWorker() {
    if (!isRunning) return;
    if (activeCount >= desiredVus) return;

    activeCount++;
    vuCounter++;
    const vuId = vuCounter;
    const reqStart = Date.now();

    scenarioFn(vuId).then((r) => {
      activeCount--;
      const reqEnd = Date.now();
      const sec = Math.floor((reqStart - startTime) / 1000);

      completed++;
      if (r.ok) succeeded++;
      else failed++;

      if (r.steps) {
        for (const s of r.steps) {
          allResults.push({ second: sec, ...s });
          if (!tagStats[s.tag]) tagStats[s.tag] = { count: 0, durations: [], errors: 0 };
          tagStats[s.tag].count++;
          tagStats[s.tag].durations.push(s.duration);
          if (s.status < 200 || s.status >= 400) tagStats[s.tag].errors++;
        }
      } else {
        allResults.push({ second: sec, tag: r.tag, duration: r.duration, status: r.status, ok: r.ok });
        if (!tagStats[r.tag]) tagStats[r.tag] = { count: 0, durations: [], errors: 0 };
        tagStats[r.tag].count++;
        tagStats[r.tag].durations.push(r.duration);
        if (!r.ok) tagStats[r.tag].errors++;
      }

      // 补充 worker
      launchWorker();
    }).catch(() => {
      activeCount--;
      launchWorker();
    });
  }

  // 调度器：每秒更新 desiredVus 并补充 worker
  const scheduleInterval = setInterval(() => {
    if (!isRunning) return;
    const elapsed = (Date.now() - startTime) / 1000;
    desiredVus = calcVus(elapsed);

    // 采集 timeline
    timeline.push({
      second: Math.floor(elapsed),
      vus: desiredVus,
      activeCount,
      completed,
      succeeded,
      failed,
      elapsed: Date.now() - startTime,
    });

    // 补充 worker
    while (activeCount < desiredVus && isRunning) {
      launchWorker();
    }

    // ramp-down 到 0 时停止
    if (desiredVus === 0) {
      isRunning = false;
      clearInterval(scheduleInterval);
    }
  }, 1000);

  // ===== 进度输出线程 =====
  const progressInterval = setInterval(() => {
    if (!isRunning) { clearInterval(progressInterval); return; }
    const elapsed = (Date.now() - startTime) / 1000;
    const min = Math.floor(elapsed / 60);
    const sec = Math.floor(elapsed % 60);
    process.stdout.write(`\r  [${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}] VUs: ${desiredVus}/${activeCount} | 完成: ${completed} | 成功: ${succeeded} | 失败: ${failed}`);
  }, 1000);

  // 等待测试完成
  await new Promise((resolve) => {
    const check = setInterval(() => {
      if (!isRunning && activeCount === 0) {
        clearInterval(check);
        clearInterval(progressInterval);
        resolve();
      }
    }, 500);
  });

  const totalElapsed = (Date.now() - startTime) / 1000;
  console.log(`\n\n测试完成，实际耗时: ${totalElapsed.toFixed(1)}s\n`);

  // ========== 计算指标 ==========
  function calcStats(durations) {
    if (durations.length === 0) return { avg: 0, min: 0, max: 0, p50: 0, p90: 0, p95: 0, stddev: 0 };
    const sorted = [...durations].sort((a, b) => a - b);
    const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
    const variance = sorted.reduce((s, v) => s + (v - avg) ** 2, 0) / sorted.length;
    return {
      avg: Math.round(avg * 100) / 100,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p90: sorted[Math.floor(sorted.length * 0.9)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      stddev: Math.round(Math.sqrt(variance) * 100) / 100,
    };
  }

  // 稳定阶段 (ramp-up 之后) 的平均 TPS
  const steadyTimeline = timeline.filter(t => t.second >= RAMPUP_SEC && t.second < RAMPUP_SEC + DURATION_SEC);
  let steadyTPS = 0;
  if (steadyTimeline.length >= 2) {
    const first = steadyTimeline[0];
    const last = steadyTimeline[steadyTimeline.length - 1];
    const steadySec = last.second - first.second;
    const steadyCompletions = last.completed - first.completed;
    steadyTPS = steadySec > 0 ? steadyCompletions / steadySec : 0;
  }

  // 按 tag 汇总
  const tagSummary = {};
  for (const [tag, stats] of Object.entries(tagStats)) {
    const s = calcStats(stats.durations);
    tagSummary[tag] = {
      count: stats.count,
      errors: stats.errors,
      errorRate: stats.count > 0 ? ((stats.errors / stats.count) * 100).toFixed(2) + '%' : '0%',
      responseTime: s,
    };
  }

  // 全局指标
  const allDurations = allResults.map(r => r.duration);
  const globalStats = calcStats(allDurations);
  const errorRate = completed > 0 ? ((failed / completed) * 100).toFixed(2) + '%' : '0%';

  const report = {
    meta: {
      scenario: SCENARIO,
      targetVUs: TARGET_VUS,
      rampUpSec: RAMPUP_SEC,
      durationSec: DURATION_SEC,
      rampDownSec: RAMPDOWN_SEC,
      totalSec: TOTAL_SEC,
      actualElapsedSec: Math.round(totalElapsed * 100) / 100,
      baseUrl: BASE_URL,
      timestamp: new Date().toISOString(),
      tool: 'Node.js Performance Test Runner (A5)',
    },
    summary: {
      totalRequests: completed * (SCENARIO === 'auth' ? 3 : 1),
      totalTransactions: completed,
      succeeded,
      failed,
      errorRate,
      avgTPS: Math.round(steadyTPS * 100) / 100,
      responseTime: globalStats,
    },
    byEndpoint: tagSummary,
    timeline: timeline.slice(0, 10).concat(
      [{ _note: `... ${timeline.length - 20} samples omitted` }],
      timeline.slice(-10)
    ),
  };

  // 输出摘要
  console.log('========== 测试结果摘要 ==========');
  console.log(`总事务数:       ${completed}`);
  console.log(`成功 / 失败:    ${succeeded} / ${failed}`);
  console.log(`错误率:        ${errorRate}`);
  console.log(`平均 TPS:      ${report.summary.avgTPS}`);
  console.log(`响应时间 (avg): ${globalStats.avg}ms`);
  console.log(`响应时间 (p50): ${globalStats.p50}ms`);
  console.log(`响应时间 (p90): ${globalStats.p90}ms`);
  console.log(`响应时间 (p95): ${globalStats.p95}ms`);
  console.log(`响应时间 (min): ${globalStats.min}ms`);
  console.log(`响应时间 (max): ${globalStats.max}ms`);
  console.log(`标准差:         ${globalStats.stddev}ms`);
  console.log('==================================\n');

  // 保存报告
  const reportDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const filename = `${SCENARIO}-${TARGET_VUS}vu.json`;
  const filepath = path.join(reportDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  console.log(`报告已保存: ${filepath}`);

  return report;
}

main().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
