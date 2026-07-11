// A5 性能测试 - 场景1：登录接口
// 对标文档：模拟多用户登录，梯形负载（ramp-up → steady → ramp-down）
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// 自定义指标
const loginDuration = new Trend('login_duration', true);
const loginSuccessRate = new Rate('login_success');
const loginErrors = new Counter('login_errors');

// 测试用户池：perf_user_001 ~ perf_user_100，密码统一为 TestPass123
const USER_COUNT = 100;
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

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
  // 负载配置由 CLI --vus / --stage 覆盖，此处为默认值
  stages: [
    { duration: '10s', target: 50 },   // ramp-up: 5 用户/秒
    { duration: '9m', target: 50 },    // steady: 保持稳定
    { duration: '50s', target: 0 },    // ramp-down: 逐步释放
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],        // 95% 请求 < 3s
    http_req_failed: ['rate<0.05'],            // 错误率 < 5%
  },
};

export default function () {
  // 每个 VU 从用户池中选取用户（基于 VU ID 取模）
  const user = userPool[__VU % userPool.length];

  const payload = JSON.stringify({
    username: user.username,
    password: user.password,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { name: 'POST /api/auth/login' },
  };

  const res = http.post(`${BASE_URL}/api/auth/login`, payload, params);

  // 断言检查
  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'response success': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true;
      } catch {
        return false;
      }
    },
    'has token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.data?.token === 'string' && body.data.token.length > 0;
      } catch {
        return false;
      }
    },
  });

  // 记录自定义指标
  loginDuration.add(res.timings.duration);
  loginSuccessRate.add(ok);
  if (!ok) loginErrors.add(1);

  // 模拟用户思考时间：0.5 ~ 2 秒
  sleep(Math.random() * 1.5 + 0.5);
}

export function teardown() {
  console.log('=== 登录接口测试完成 ===');
}
