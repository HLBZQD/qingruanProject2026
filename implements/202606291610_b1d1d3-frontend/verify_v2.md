# 验证报告（v2）

## 结果
PASSED

## 统计
- TS 类型错误：0
- 构建产物模块数：172 modules transformed，29 output chunks
- 构建耗时：794ms
- 产物总大小：dist/ 约 487 KB（含 SweetAlert2 78KB）
- 警告（非阻断）：1 条 INEFFECTIVE_DYNAMIC_IMPORT（rollup 优化提示，不影响功能）

## 验证执行日志

> diabetes-assistant@1.0.0 build:client
> vue-tsc -b && vite build

[36mvite v8.1.0 [32mbuilding client environment for production...[36m[39m
[2K
transforming...✓ 172 modules transformed.
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
dist/assets/Admin-CL5-7Kk9.css                7.62 kB │ gzip:  1.68 kB
dist/assets/DoctorChatView-D0Lmul95.css       7.73 kB │ gzip:  1.68 kB
dist/assets/Home-G1sGjuqu.css                 9.27 kB │ gzip:  2.12 kB
dist/assets/LifePlan-Bh1ZEIKY.css             9.55 kB │ gzip:  1.81 kB
dist/assets/index-B7106Ocw.css               10.73 kB │ gzip:  2.54 kB
dist/assets/Punch-DWXUIxJ4.css               12.50 kB │ gzip:  2.22 kB
dist/assets/rolldown-runtime-QTnfLwEv.js      0.69 kB │ gzip:  0.42 kB
dist/assets/sanitize-Df6PHs6K.js              0.78 kB │ gzip:  0.55 kB
dist/assets/enumLabels-D-jcj1qt.js            1.24 kB │ gzip:  0.81 kB
dist/assets/riskFormStore-BRs-vjA8.js         1.77 kB │ gzip:  0.82 kB
dist/assets/Consultation-CYqIYIql.js          2.08 kB │ gzip:  1.09 kB
dist/assets/ChangePassword-C_-QuIUB.js        3.18 kB │ gzip:  1.64 kB
dist/assets/EmptyState-DxTX3xp-.js            3.31 kB │ gzip:  1.27 kB
dist/assets/HealthAdvice-C7bp7lLP.js          3.38 kB │ gzip:  1.85 kB
dist/assets/ArticleDetailView-CUuTOHSR.js     4.08 kB │ gzip:  1.73 kB
dist/assets/Login-DCqbEvXt.js                 4.55 kB │ gzip:  1.70 kB
dist/assets/DoctorChatView-DiidltIz.js        6.45 kB │ gzip:  2.83 kB
dist/assets/NewsView-B1doQ3Pj.js              6.45 kB │ gzip:  3.08 kB
dist/assets/Profile-BZfn9vny.js               6.84 kB │ gzip:  2.87 kB
dist/assets/Home-C5DyrvFY.js                  7.75 kB │ gzip:  3.02 kB
dist/assets/Admin-BTeKiHYB.js                 9.09 kB │ gzip:  4.05 kB
dist/assets/Punch-dEdXxs-E.js                12.96 kB │ gzip:  4.69 kB
dist/assets/LifePlan-AKid381o.js             13.91 kB │ gzip:  5.03 kB
dist/assets/Risk-DnXGmo_z.js                 16.58 kB │ gzip:  5.42 kB
dist/assets/sweetalert2.all-C0Xv6sTR.js      78.14 kB │ gzip: 20.84 kB
dist/assets/index-B3M7wPMS.js               246.58 kB │ gzip: 89.50 kB

node.exe : [33m[33m[INEFFECTIVE_DYNAMIC_IMPORT] [0msrc/stores/authStore.ts is dynamically imported by src/stores/chatStore.ts but also statically impor
ted by src/App.vue?vue&type=script&setup=true&lang.ts, src/components/AiChatDialog.vue?vue&type=script&setup=true&lang.ts, src/composables/useApi.ts, src/
main.ts, src/router/index.ts, ..., dynamic import will not move module into another chunk.
At line:1 char:1
+ & "C:\Program Files\nodejs/node.exe" "C:\Program Files\nodejs/node_mo ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: ([33m[33m[INEF... another chunk.:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
[39m
[32m✓ built in 794ms[39m
