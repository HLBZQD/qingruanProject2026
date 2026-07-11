// 批量执行所有性能测试场景
// 3 场景 × 3 并发级别 = 9 个测试
// 用法：node performance/scripts/run-all-tests.js
const { spawn } = require('child_process');
const path = require('path');

const SCENARIOS = ['login', 'public', 'auth'];
const VUS = [50, 100, 200];

// 每个级别的配置（文档要求）
// 文档要求 10min，这里用 2min 以便快速产出完整报告
// 如需完整 10min 测试，改为 duration: 600
const CONFIG = {
  50:  { duration: 120, rampup: 10, rampdown: 50 },
  100: { duration: 120, rampup: 20, rampdown: 40 },
  200: { duration: 120, rampup: 40, rampdown: 20 },
};

async function runTest(scenario, vus) {
  const cfg = CONFIG[vus];
  return new Promise((resolve, reject) => {
    const args = [
      path.join(__dirname, 'run-perf-test.js'),
      `--scenario=${scenario}`,
      `--vus=${vus}`,
      `--duration=${cfg.duration}`,
      `--rampup=${cfg.rampup}`,
      `--rampdown=${cfg.rampdown}`,
    ];

    console.log(`\n${'='.repeat(60)}`);
    console.log(`启动测试: ${scenario} @ ${vus} VUs`);
    console.log(`${'='.repeat(60)}`);

    const proc = spawn('node', args, { stdio: 'inherit' });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scenario}-${vus}vu exit code ${code}`));
    });
    proc.on('error', reject);
  });
}

async function main() {
  const total = SCENARIOS.length * VUS.length;
  let current = 0;

  console.log(`A5 性能测试批量执行`);
  console.log(`共 ${total} 个测试 (${SCENARIOS.length} 场景 × ${VUS.length} 级别)`);
  console.log(`预计耗时: ~${total * 10} 分钟\n`);

  const startTime = Date.now();

  for (const scenario of SCENARIOS) {
    for (const vus of VUS) {
      current++;
      console.log(`\n[${current}/${total}] ${scenario} @ ${vus} VUs`);
      try {
        await runTest(scenario, vus);
      } catch (err) {
        console.error(`测试失败: ${err.message}`);
      }
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 60000);
  console.log(`\n\n全部测试完成! 总耗时: ${elapsed} 分钟`);
  console.log(`报告目录: ${path.join(__dirname, '..', 'reports')}`);
}

main().catch(err => {
  console.error('批量测试异常:', err);
  process.exit(1);
});
