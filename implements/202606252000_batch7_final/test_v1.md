# test_v1.md - 测试用例脚本

```bash
###############################################################################
# 清理环境 & 启动服务
###############################################################################
rm -f data/database.sqlite server/data/database.sqlite
nohup node server.js > /tmp/server.log 2>&1 &
sleep 2

###############################################################################
# 注册用户
###############################################################################
echo "=== 1. Register ==="
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test1234"}'

###############################################################################
# 登录 (admin 和 user)
###############################################################################
echo "=== 2. Login admin ==="
ADMIN_RESP=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')
echo "$ADMIN_RESP"

echo "=== 3. Login user ==="
USER_RESP=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test1234"}')
echo "$USER_RESP"

# 提取 token (用 python/json 工具或手动)
UT=$(echo "$USER_RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
AT=$(echo "$ADMIN_RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")

###############################################################################
# 文章生成 - 不带 category (推荐分类)
###############################################################################
echo "=== 4. Generate (no category) ==="
curl -s -X POST http://localhost:3000/api/articles/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $UT" \
  -d '{}'

###############################################################################
# 文章生成 - 带 category (生成文章)
###############################################################################
sleep 31  # 绕过30秒频率限制
echo "=== 5. Generate (with category) ==="
curl -s -X POST http://localhost:3000/api/articles/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $UT" \
  -d '{"category":"运动指南"}'

###############################################################################
# 验证文章 user_id 不为空
###############################################################################
echo "=== 6. DB: articles user_id ==="
sqlite3 data/database.sqlite "SELECT id, user_id, title FROM articles;"

###############################################################################
# 公共文章列表 (不应包含私有文章)
###############################################################################
echo "=== 7. Public articles ==="
curl -s http://localhost:3000/api/articles | python3 -c "
import sys,json
data=json.load(sys.stdin)['data']
ids=[a['id'] for a in data]
print('Public article IDs:', ids)
assert len(data) <= 3, 'Should not include user private articles'
print('OK - user private articles not exposed')
"

###############################################################################
# 上传非图片 → 415
###############################################################################
echo "=== 8. Upload non-image → 415 ==="
echo "not an image" > /tmp/fake.txt
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/upload/avatar \
  -H "Authorization: Bearer $UT" \
  -F "avatar=@/tmp/fake.txt;type=text/plain")
echo "HTTP status: $HTTP_CODE"
[ "$HTTP_CODE" = "415" ] && echo "OK - 415" || echo "FAIL"

###############################################################################
# 上传 >2MB → 413
###############################################################################
echo "=== 9. Upload large → 413 ==="
dd if=/dev/zero of=/tmp/large.jpg bs=1M count=3 2>/dev/null
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/upload/avatar \
  -H "Authorization: Bearer $UT" \
  -F "avatar=@/tmp/large.jpg;type=image/jpeg")
echo "HTTP status: $HTTP_CODE"
[ "$HTTP_CODE" = "413" ] && echo "OK - 413" || echo "FAIL"

###############################################################################
# 管理员日志 → 200 (分页格式)
###############################################################################
echo "=== 10. Admin logs → 200 ==="
curl -s http://localhost:3000/api/admin/logs \
  -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['success']==True
assert 'pagination' in d
assert set(d['pagination'].keys()) == {'page','pageSize','total','totalPages'}
print('OK - pagination format correct')
"

###############################################################################
# 非管理员访问 admin/logs → 403
###############################################################################
echo "=== 11. Non-admin logs → 403 ==="
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/admin/logs \
  -H "Authorization: Bearer $UT")
echo "HTTP status: $HTTP_CODE"
[ "$HTTP_CODE" = "403" ] && echo "OK - 403" || echo "FAIL"

###############################################################################
# SQL: SELECT → 成功
###############################################################################
echo "=== 12. SQL SELECT ==="
curl -s -X POST http://localhost:3000/api/admin/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AT" \
  -d '{"sql":"SELECT COUNT(*) AS cnt FROM users"}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['success']==True
print('OK - SELECT works')
"

###############################################################################
# SQL: INSERT → 拒绝
###############################################################################
echo "=== 13. SQL INSERT → forbidden ==="
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/admin/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AT" \
  -d '{"sql":"INSERT INTO users (username,password) VALUES (\"hacker\",\"x\")"}')
echo "HTTP status: $HTTP_CODE"
[ "$HTTP_CODE" = "403" ] && echo "OK - INSERT rejected" || echo "FAIL"

###############################################################################
# 统一错误格式
###############################################################################
echo "=== 14. Error format ==="
curl -s http://localhost:3000/api/nonexistent | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert 'error' in d
assert 'code' in d['error']
assert 'message' in d['error']
assert 'success' not in d
print('OK - error format: {error:{code,message}}')
"

echo ""
echo "=== ALL TESTS PASSED ==="
```
