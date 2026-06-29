# 验证报告（v1）

## 结果
[PASSED]

## 统计
- 类型错误（vue-tsc）：0
- 编译错误（vite build）：0
- 构建警告：1（INEFFECTIVE_DYNAMIC_IMPORT — authStore.ts 被静态+动态同时引入，不影响功能）
- 产物：dist/ 已产出（HTML 1 + CSS 14 + JS 20，主入口 index-ChcORX5v.js 245.56 kB / gzip 89.29 kB）
- 构建耗时：389ms

## 验证执行日志

> diabetes-assistant@1.0.0 build:client
> vue-tsc -b && vite build

[36mvite v8.1.0 [32mbuilding client environment for production...[36m[39m
[2Ktransforming...✓ 172 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                               0.66 kB │ gzip:  0.43 kB
dist/assets/Profile-CnFMNqH0.css              0.12 kB │ gzip:  0.11 kB
dist/assets/Risk-DIP8RTJD.css                 0.49 kB │ gzip:  0.23 kB
dist/assets/ChangePassword-BFsuOO_Z.css       2.36 kB │ gzip:  0.74 kB
dist/assets/HealthAdvice-FCuY1sWq.css         3.31 kB │ gzip:  0.92 kB
dist/assets/EmptyState-cWanjdX4.css           3.41 kB │ gzip:  0.79 kB
dist/assets/Consultation-CCLjmeMo.css         3.74 kB │ gzip:  0.98 kB
dist/assets/NewsView-XarXb6tI.css             4.25 kB │ gzip:  1.17 kB
dist/assets/ArticleDetailView-BrsbyLuy.css    4.76 kB │ gzip:  1.09 kB
dist/assets/DoctorChatView-CHlG67q3.css       5.19 kB │ gzip:  1.28 kB
dist/assets/Admin-CL5-7Kk9.css                7.62 kB │ gzip:  1.68 kB
dist/assets/Home-G1sGjuqu.css                 9.27 kB │ gzip:  2.12 kB
dist/assets/LifePlan-Bh1ZEIKY.css             9.55 kB │ gzip:  1.81 kB
dist/assets/index-B7106Ocw.css               10.73 kB │ gzip:  2.54 kB
dist/assets/Punch-DWXUIxJ4.css               12.50 kB │ gzip:  2.22 kB
dist/assets/rolldown-runtime-QTnfLwEv.js      0.69 kB │ gzip:  0.42 kB
dist/assets/sanitize-CpMZi3vM.js              0.78 kB │ gzip:  0.55 kB
dist/assets/enumLabels-DqDjmB73.js            1.24 kB │ gzip:  0.81 kB
dist/assets/riskFormStore-BMvtdcaq.js         1.77 kB │ gzip:  0.82 kB
dist/assets/Consultation-CEvoS44f.js          2.08 kB │ gzip:  1.09 kB
dist/assets/ChangePassword-Dn-ENLyW.js        3.18 kB │ gzip:  1.64 kB
dist/assets/EmptyState-CgNApgic.js            3.31 kB │ gzip:  1.27 kB
dist/assets/HealthAdvice-CJPf0g9s.js          3.38 kB │ gzip:  1.85 kB
dist/assets/ArticleDetailView-CIq-mcvK.js     4.08 kB │ gzip:  1.73 kB
dist/assets/DoctorChatView-D8QsOvlY.js        4.34 kB │ gzip:  2.17 kB
dist/assets/Login-DCvimgOc.js                 4.55 kB │ gzip:  1.70 kB
dist/assets/NewsView-BUMq1HT5.js              6.45 kB │ gzip:  3.08 kB
dist/assets/Profile-DpPp7_wb.js               6.84 kB │ gzip:  2.87 kB
dist/assets/Home-Bznno5_p.js                  7.75 kB │ gzip:  3.02 kB
dist/assets/Admin-CvgEUPsx.js                 9.09 kB │ gzip:  4.04 kB
dist/assets/Punch-DSOHCMvX.js                12.96 kB │ gzip:  4.69 kB
dist/assets/LifePlan-CnD1tVJM.js             13.91 kB │ gzip:  5.03 kB
dist/assets/Risk-DeUuvAHp.js                 16.58 kB │ gzip:  5.42 kB
dist/assets/sweetalert2.all-C0Xv6sTR.js      78.14 kB │ gzip: 20.84 kB
dist/assets/index-ChcORX5v.js               245.56 kB │ gzip: 89.29 kB

[32m✓ built in 389ms[39m
