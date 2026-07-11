// A5 性能测试 - 场景3：认证接口（先登录，再请求受保护资源）
// 模拟完整用户流程：登录 → 获取资料 → 查询历史
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const loginTime = new Trend('auth_login_time', true);
const profileTime = new Trend('auth_profile_time', true);
const historyTime = new Trend('auth_history_time', true);
const authSuccessRate = new Rate('auth_success');
const authErrors = new Counter('auth_errors');

const USER_COUNT = 100;

function buildUserPool() {
  const users = [];
  for (let i = 1; i <= USER_COUNT; i++) {
    users.push({
      username: `perf_user_${String(i).padStart(3, '0')}`,
      password: 'TestPass123',
    });
  }
  return users;
}

const userPool = buildUserPool();

export const options = {
  stages: [
    { duration: '10s', target: 50 },
    { duration: '9m', target: 50 },
    { duration: '50s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const user = userPool[__VU % userPool.length];

  // Step 1: 登录获取 Token
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ username: user.username, password: user.password }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'POST /api/auth/login (auth flow)' },
    }
  );

  let token = null;
  let loginOk = check(loginRes, {
    'login status 200': (r) => r.status === 200,
    'login has token': (r) => {
      try {
        const body = JSON.parse(r.body);
        token = body.data?.token;
        return typeof token === 'string' && token.length > 0;
      } catch {
        return false;
      }
    },
  });

  loginTime.add(loginRes.timings.duration);

  if (!token) {
    authErrors.add(1);
    authSuccessRate.add(false);
    sleep(2);
    return;
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // Step 2: 获取用户资料
  const profileRes = http.get(`${BASE_URL}/api/user/profile`, {
    headers: authHeaders,
    tags: { name: 'GET /api/user/profile' },
  });

  const profileOk = check(profileRes, {
    'profile status 200': (r) => r.status === 200,
    'profile success': (r) => {
      try {
        return JSON.parse(r.body).success === true;
      } catch {
        return false;
      }
    },
  });

  profileTime.add(profileRes.timings.duration);

  // Step 3: 查询风险预测历史
  const historyRes = http.get(`${BASE_URL}/api/risk/history?page=1&pageSize=5`, {
    headers: authHeaders,
    tags: { name: 'GET /api/risk/history' },
  });

  const historyOk = check(historyRes, {
    'history status 200': (r) => r.status === 200,
    'history success': (r) => {
      try {
        return JSON.parse(r.body).success === true;
      } catch {
        return false;
      }
    },
  });

  historyTime.add(historyRes.timings.duration);

  const overallOk = loginOk && profileOk && historyOk;
  authSuccessRate.add(overallOk);
  if (!overallOk) authErrors.add(1);

  // 用户操作间隔：2~5 秒
  sleep(Math.random() * 3 + 2);
}
