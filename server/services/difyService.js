const http = require('http');
const https = require('https');
const { AppError } = require('../middleware/errorHandler');

const MOCK_RISK_DATA = {
  data: {
    id: 'mock-workflow-run-id-risk',
    workflow_id: 'mock-workflow-risk',
    status: 'succeeded',
    outputs: {
      text: '{"risk_score":15,"risk_level":"medium","risk_level_label":"中风险","risk_level_detail":"根据评分体系，您的评分为15分，属于中风险人群。","diabetes_type":"type2","matched_diabetes_type":"2型糖尿病","suggestions":["建议调整饮食结构","增加运动量","定期监测血糖"],"bmi":25.95}'
    },
    error: null,
    elapsed_time: 0.5,
    total_tokens: 0,
    total_steps: 0,
    created_at: 1719244800
  }
};

const MOCK_PLAN_DATA = {
  data: {
    id: 'mock-workflow-run-id-plan',
    workflow_id: 'mock-workflow-plan',
    status: 'succeeded',
    outputs: {
      text: '[{"plan_type":"diet","order_num":1,"time_desc":"7:00-8:00","title":"燕麦粥 + 水煮蛋","content":"燕麦50g，加水煮粥；鸡蛋1个水煮；黄瓜100g切丝凉拌，少油少盐。"},{"plan_type":"diet","order_num":2,"time_desc":"12:00-13:00","title":"杂粮饭 + 清蒸鱼","content":"杂粮饭150g，清蒸鲈鱼100g，清炒时蔬200g。"},{"plan_type":"diet","order_num":3,"time_desc":"18:00-19:00","title":"蔬菜沙拉 + 鸡胸肉","content":"生菜100g、西红柿1个、鸡胸肉100g，橄榄油5ml，醋适量。"},{"plan_type":"diet","order_num":4,"time_desc":"15:00-15:30","title":"坚果 + 无糖酸奶","content":"核桃3个，无糖酸奶200ml。"},{"plan_type":"exercise","order_num":1,"time_desc":"6:30-7:00","title":"晨间快走","content":"快走30分钟，速度5-6km/h，心率控制在120次/分以内。"},{"plan_type":"exercise","order_num":2,"time_desc":"19:00-19:30","title":"晚间散步","content":"散步30分钟，饭后1小时进行。"},{"plan_type":"exercise","order_num":3,"time_desc":"8:00-9:00","title":"周末太极","content":"太极拳60分钟，注意膝盖保护，避免深蹲动作。"}]'
    },
    error: null,
    elapsed_time: 0.8,
    total_tokens: 0,
    total_steps: 0,
    created_at: 1719244800
  }
};

function httpRequest(urlStr, options) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const mod = parsedUrl.protocol === 'https:' ? https : http;

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'POST',
      headers: options.headers || {},
      timeout: options.timeout || 15000
    };

    const req = mod.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          reject(new AppError(502, 'DIFY_ERROR', 'Dify 返回数据格式异常'));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new AppError(504, 'AI_TIMEOUT', 'AI 服务响应超时，请稍后重试'));
    });

    req.on('error', (e) => {
      if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT' || e.name === 'AbortError') {
        reject(new AppError(504, 'AI_TIMEOUT', 'AI 服务响应超时，请稍后重试'));
      } else {
        reject(new AppError(502, 'DIFY_ERROR', '无法连接 AI 服务'));
      }
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function callWorkflowBlocking(apiKey, inputs, workflowType) {
  const baseUrl = process.env.DIFY_API_BASE;

  if (!baseUrl) {
    console.log('[difyService] Mock mode: returning mock data for', workflowType);
    if (workflowType === 'risk') return MOCK_RISK_DATA;
    if (workflowType === 'plan') return MOCK_PLAN_DATA;
    if (workflowType === 'article') return { data: { outputs: { text: '' } } };
    return MOCK_PLAN_DATA;
  }

  const url = baseUrl.replace(/\/$/, '') + '/workflows/run';

  const { status, body } = await httpRequest(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      inputs: inputs,
      response_mode: 'blocking',
      user: 'api-user'
    }),
    timeout: 15000
  });

  if (status >= 200 && status < 300) {
    return body;
  }

  if (status === 400) {
    throw new AppError(422, 'VALIDATION_ERROR', (body && body.message) || '请求参数校验失败');
  }
  if (status === 401) {
    throw new AppError(502, 'DIFY_ERROR', 'Dify API Key 无效');
  }
  if (status === 404) {
    throw new AppError(502, 'DIFY_ERROR', '应用/工作流不存在');
  }
  if (status === 429) {
    throw new AppError(429, 'RATE_LIMITED', '请求过于频繁，请稍后再试');
  }
  if (status >= 500) {
    throw new AppError(502, 'DIFY_ERROR', 'Dify 服务内部错误');
  }

  throw new AppError(502, 'DIFY_ERROR', 'Dify 返回未知错误');
}

async function callDifyGetConversations(apiKey, userId) {
  const baseUrl = process.env.DIFY_API_BASE;

  if (!baseUrl) {
    console.log('[difyService] Mock mode: returning empty conversations');
    return [];
  }

  const url = baseUrl.replace(/\/$/, '') + '/conversations?user=user-' + userId;

  try {
    const { status, body } = await httpRequest(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (status >= 200 && status < 300 && body && body.data) {
      return body.data.map(item => ({
        conversation_id: item.id,
        name: item.name || '',
        created_at: item.created_at ? new Date(item.created_at * 1000).toISOString() : ''
      }));
    }
  } catch (e) {
    console.error('[difyService] getConversations failed:', e.message);
  }

  return [];
}

module.exports = { callWorkflowBlocking, callDifyGetConversations };
