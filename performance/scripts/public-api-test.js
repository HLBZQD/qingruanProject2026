// A5 性能测试 - 场景2：公开读接口（无需认证）
// 混合比例 health:doctors:articles:diabetes = 1:2:4:2
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const healthDuration = new Trend('health_duration', true);
const doctorsDuration = new Trend('doctors_duration', true);
const articlesDuration = new Trend('articles_duration', true);
const diabetesDuration = new Trend('diabetes_duration', true);
const publicSuccessRate = new Rate('public_success');
const publicErrors = new Counter('public_errors');

export const options = {
  stages: [
    { duration: '10s', target: 50 },
    { duration: '9m', target: 50 },
    { duration: '50s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
  },
};

// 权重分配：health=1, doctors=2, articles=4, diabetes=2 (总权重=9)
function selectEndpoint() {
  const r = Math.random() * 9;
  if (r < 1) return { path: '/api/health', trend: healthDuration, tag: 'health' };
  if (r < 3) return { path: '/api/doctors', trend: doctorsDuration, tag: 'doctors' };
  if (r < 7) return { path: '/api/articles', trend: articlesDuration, tag: 'articles' };
  return { path: '/api/diabetes-types', trend: diabetesDuration, tag: 'diabetes' };
}

export default function () {
  const ep = selectEndpoint();

  const res = http.get(`${BASE_URL}${ep.path}`, {
    tags: { name: `GET ${ep.path}` },
  });

  const ok = check(res, {
    [`GET ${ep.path} status 200`]: (r) => r.status === 200,
    [`GET ${ep.path} success`]: (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true;
      } catch {
        return false;
      }
    },
  });

  ep.trend.add(res.timings.duration);
  publicSuccessRate.add(ok);
  if (!ok) publicErrors.add(1);

  // 用户浏览间隔：1~3 秒
  sleep(Math.random() * 2 + 1);
}
