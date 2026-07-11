// 汇总所有测试报告，生成实验结果记录表
// 用法：node performance/scripts/generate-report.js
const fs = require('fs');
const path = require('path');

const reportDir = path.join(__dirname, '..', 'reports');
const outputPath = path.join(__dirname, '..', '实验结果记录表.md');

const SCENARIOS = [
  { key: 'login', name: 'S1：登录接口', desc: '模拟多用户并发登录', eps: ['POST /api/auth/login'] },
  { key: 'public', name: 'S2：公开读接口', desc: '模拟游客浏览健康资讯', eps: ['GET /api/health', 'GET /api/doctors', 'GET /api/articles', 'GET /api/diabetes-types'] },
  { key: 'auth', name: 'S3：认证读接口', desc: '登录→获取资料→查询历史', eps: ['POST /api/auth/login', 'GET /api/user/profile', 'GET /api/risk/history'] },
];

const VUS = [50, 100, 200];

function loadReport(scenario, vus) {
  const file = path.join(reportDir, `${scenario}-${vus}vu.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function formatRow(label, values) {
  return `| ${label} | ${values.join(' | ')} |`;
}

function formatMs(ms) {
  if (ms == null || isNaN(ms)) return 'N/A';
  return ms < 1 ? ms.toFixed(2) + ' ms' : Math.round(ms) + ' ms';
}

function main() {
  console.log('生成 A5 性能测试报告...\n');

  let report = '';

  // 标题
  report += '# 附件一：A5 性能测试 —— 实验结果记录表\n\n';

  // 基本信息
  report += '## 测试基本信息\n\n';
  report += '| 项目 | 内容 |\n|------|------|\n';
  report += '| **被测系统** | 糖尿病预治智能助手 (Diabetes Assistant) |\n';
  report += '| **被测系统版本** | v1.0.0 |\n';
  report += '| **测试工具** | Node.js Performance Test Runner (A5) |\n';
  report += '| **测试日期** | 2026-07-03 |\n';
  report += '| **测试人员** | 组员 郭 |\n';
  report += '| **测试环境** | Windows 11, Node.js v25.9.0, SQLite (本地) |\n';
  report += '| **服务器配置** | CPU: 2.00GHz+, 单机部署（客户端=服务端） |\n\n';

  // 场景定义
  report += '---\n\n## 场景定义\n\n';
  report += '| 场景编号 | 场景名称 | 描述 | 涉及端点 |\n|:---:|------|------|------|\n';
  for (const s of SCENARIOS) {
    report += `| ${s.key} | ${s.name} | ${s.desc} | \`${s.eps.join('`, `')}\` |\n`;
  }
  report += '\n';

  // 负载配置
  report += '---\n\n## 负载配置\n\n';
  report += '| 参数 | 50 VU | 100 VU | 200 VU |\n|------|:---:|:---:|:---:|\n';
  report += '| 并发用户数 | 50 | 100 | 200 |\n';
  report += '| 用户创建速率 | 5/s | 5/s | 5/s |\n';
  report += '| 负载模式 | 梯形 | 梯形 | 梯形 |\n';
  report += '| Ramp-up 时长 | 10s | 20s | 40s |\n';
  report += '| Steady 时长 | 10min | 10min | 10min |\n';
  report += '| Ramp-down 时长 | 50s | 40s | 20s |\n\n';

  // 测试结果
  report += '---\n\n## 测试结果汇总\n\n';

  for (const s of SCENARIOS) {
    report += `### ${s.name}\n\n`;

    // 表头
    const header = ['指标', ...VUS.map(v => `${v} VU`)];
    report += '| ' + header.join(' | ') + ' |\n';
    report += '|' + header.map(() => '------').join('|') + '|\n';

    const rows = [];
    let hasData = false;

    for (const vus of VUS) {
      const data = loadReport(s.key, vus);
      if (data) hasData = true;

      const summary = data?.summary || {};
      const rt = summary.responseTime || {};

      rows.push({
        vus,
        total: summary.totalTransactions ?? 'TBD',
        succeeded: summary.succeeded ?? 'TBD',
        failed: summary.failed ?? 'TBD',
        errorRate: summary.errorRate ?? 'TBD',
        avgTPS: summary.avgTPS != null ? Math.round(summary.avgTPS) : 'TBD',
        avgRt: rt.avg != null ? formatMs(rt.avg) : 'TBD',
        p50: rt.p50 != null ? formatMs(rt.p50) : 'TBD',
        p90: rt.p90 != null ? formatMs(rt.p90) : 'TBD',
        p95: rt.p95 != null ? formatMs(rt.p95) : 'TBD',
        minRt: rt.min != null ? formatMs(rt.min) : 'TBD',
        maxRt: rt.max != null ? formatMs(rt.max) : 'TBD',
        stddev: rt.stddev != null ? formatMs(rt.stddev) : 'TBD',
      });
    }

    if (!hasData) {
      report += `| *数据待测试完成后填入* | | | |\n\n`;
      continue;
    }

    const metrics = [
      ['总事务数', rows.map(r => String(r.total))],
      ['成功事务', rows.map(r => String(r.succeeded))],
      ['失败事务', rows.map(r => String(r.failed))],
      ['**错误率**', rows.map(r => `**${r.errorRate}**`)],
      ['**平均 TPS**', rows.map(r => `**${r.avgTPS}**`)],
      ['平均响应时间', rows.map(r => r.avgRt)],
      ['P50 响应时间', rows.map(r => r.p50)],
      ['P90 响应时间', rows.map(r => r.p90)],
      ['P95 响应时间', rows.map(r => r.p95)],
      ['最小响应时间', rows.map(r => r.minRt)],
      ['最大响应时间', rows.map(r => r.maxRt)],
      ['**标准差**', rows.map(r => `**${r.stddev}**`)],
    ];

    for (const [label, values] of metrics) {
      report += `| ${label} | ${values.join(' | ')} |\n`;
    }
    report += '\n';
  }

  // 测试环境配置
  report += '---\n\n## 测试环境配置详情\n\n';
  report += '| 配置项 | 值 |\n|------|------|\n';
  report += '| 操作系统 | Windows 11 Home China 10.0.26200 |\n';
  report += '| Node.js 版本 | v25.9.0 |\n';
  report += '| 数据库类型 | SQLite（本地文件数据库） |\n';
  report += '| Express 版本 | 4.21.0 |\n';
  report += '| 服务端口 | 3000 |\n';
  report += '| bcrypt saltRounds | 10 |\n\n';

  // 结论
  report += '---\n\n## 结论与分析\n\n';
  report += '### 性能表现总结\n\n';

  // 按场景计算趋势
  for (const s of SCENARIOS) {
    report += `#### ${s.name}\n\n`;
    let hasAll = true;
    const tpsVals = [];
    const rtVals = [];
    for (const vus of VUS) {
      const data = loadReport(s.key, vus);
      if (!data) { hasAll = false; break; }
      tpsVals.push(data.summary.avgTPS);
      rtVals.push(data.summary.responseTime.avg);
    }

    if (hasAll) {
      report += `- **TPS 趋势**: 50VU=${Math.round(tpsVals[0])} → 100VU=${Math.round(tpsVals[1])} → 200VU=${Math.round(tpsVals[2])}\n`;
      report += `- **响应时间趋势**: 50VU=${formatMs(rtVals[0])} → 100VU=${formatMs(rtVals[1])} → 200VU=${formatMs(rtVals[2])}\n`;
    } else {
      report += '*（待全部测试完成后分析）*\n';
    }
    report += '\n';
  }

  report += '### 综合评价\n\n';
  report += '*（待全部测试完成后填写）*\n\n';

  report += '---\n\n## 附件列表\n\n';
  const files = fs.existsSync(reportDir) ? fs.readdirSync(reportDir).filter(f => f.endsWith('.json')) : [];
  for (const f of files.sort()) {
    report += `- \`performance/reports/${f}\`\n`;
  }
  report += `- \`performance/scripts/login-test.js\` (k6 兼容脚本)\n`;
  report += `- \`performance/scripts/public-api-test.js\` (k6 兼容脚本)\n`;
  report += `- \`performance/scripts/authenticated-test.js\` (k6 兼容脚本)\n`;
  report += `- \`performance/scripts/run-perf-test.js\` (Node.js 测试运行器)\n`;

  fs.writeFileSync(outputPath, report, 'utf-8');
  console.log(`报告已生成: ${outputPath}`);
  console.log(`包含 ${files.length} 个测试结果文件`);
}

main();
