// Edge Functions 逻辑测试脚本（模拟 KV + 请求）
// 运行：node test-edge-functions.mjs

// 模拟 EdgeOne KV
const kvStore = new Map();
globalThis.my_kv = {
  get: async (key) => kvStore.has(key) ? kvStore.get(key) : null,
  put: async (key, value) => { kvStore.set(key, value); },
  delete: async (key) => { kvStore.delete(key); }
};

// 简化测试：直接读源码中的哈希逻辑
import crypto from 'node:crypto';
const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');

// 加载 Edge Functions
const login = await import('./edge-functions/login.js');
const logout = await import('./edge-functions/logout.js');
const currentUser = await import('./edge-functions/api/current-user.js');
const usersApi = await import('./edge-functions/api/users.js');
const healthApi = await import('./edge-functions/api/health.js');

let pass = 0, fail = 0;
function assert(name, cond) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}`); }
}

// 读取 Response 内容
async function parseJson(res) {
  return JSON.parse(await res.text());
}

// --- 测试1：正确密码登录成功 ---
const loginRes = await login.onRequestPost({
  request: {
    url: 'https://example.com/login',
    json: async () => ({ username: 'wcx', password: 'dashuaige' }),
    headers: { get: () => '' }
  }
});
const loginData = await parseJson(loginRes);
assert('wcx/dashuaige 登录成功', loginData.success === true && loginData.redirect === '/success.html');
const setCookie = loginRes.headers.get('Set-Cookie');
const sessionId = setCookie.match(/session_id=([^;]+)/)[1];
assert('登录返回 session cookie', !!sessionId);
assert('生产环境 Cookie 带 Secure', setCookie.includes('Secure'));
assert('KV 中已写入会话', kvStore.has(`session:${sessionId}`));
assert('会话包含过期时间', JSON.parse(kvStore.get(`session:${sessionId}`)).expiresAt > Date.now());

// --- 测试2：错误密码登录失败 ---
const failRes = await login.onRequestPost({
  request: {
    url: 'https://example.com/login',
    json: async () => ({ username: 'wcx', password: 'wrong' }),
    headers: { get: () => '' }
  }
});
const failData = await parseJson(failRes);
assert('错误密码返回 401', failRes.status === 401);
assert('错误密码登录失败', failData.success === false);

// --- 测试3：未登录访问用户列表返回 401 ---
const unauthRes = await usersApi.onRequestGet({
  request: { headers: { get: () => '' } }
});
assert('未登录访问 /api/users 返回 401', unauthRes.status === 401);

// --- 测试4：已登录访问用户列表 ---
const authRes = await usersApi.onRequestGet({
  request: {
    url: 'https://example.com/api/users',
    headers: { get: () => `session_id=${sessionId}` }
  }
});
const users = await parseJson(authRes);
assert('已登录获取用户列表', Array.isArray(users) && users.length === 3);
assert('用户列表含 wcx', users.some(u => u.username === 'wcx'));
assert('用户列表不泄露密码', !users[0].passwordHash && !users[0].password);
assert('用户列表包含 ID 和注册时间', users.every(u => u.id && u.created_at));

// --- 测试5：获取当前用户 ---
const curRes = await currentUser.onRequestGet({
  request: {
    url: 'https://example.com/api/current-user',
    headers: { get: () => `session_id=${sessionId}` }
  }
});
const curData = await parseJson(curRes);
assert('获取当前用户', curData.loggedIn === true && curData.user.username === 'wcx');

// --- 测试6：登出后会话失效 ---
const logoutRes = await logout.onRequestPost({
  request: {
    url: 'https://example.com/logout',
    headers: { get: () => `session_id=${sessionId}` }
  }
});
assert('登出成功', (await parseJson(logoutRes)).success === true);
assert('登出 Cookie 会立即失效', logoutRes.headers.get('Set-Cookie').includes('Max-Age=0'));
assert('KV 会话已删除', !kvStore.has(`session:${sessionId}`));
const afterLogout = await currentUser.onRequestGet({
  request: {
    url: 'https://example.com/api/current-user',
    headers: { get: () => `session_id=${sessionId}` }
  }
});
assert('登出后未登录', (await parseJson(afterLogout)).loggedIn === false);

// --- 测试8：过期会话不能继续访问 ---
const expiredSessionId = '00000000-0000-4000-8000-000000000000';
kvStore.set(`session:${expiredSessionId}`, JSON.stringify({
  username: 'wcx',
  email: 'wcx@example.com',
  expiresAt: Date.now() - 1000
}));
const expiredRes = await currentUser.onRequestGet({
  request: {
    url: 'https://example.com/api/current-user',
    headers: { get: () => `session_id=${expiredSessionId}` }
  }
});
assert('过期会话已失效', (await parseJson(expiredRes)).loggedIn === false);
assert('过期会话已从 KV 清理', !kvStore.has(`session:${expiredSessionId}`));

// --- 测试9：KV 健康检查与明确错误响应 ---
kvStore.clear();
const healthRes = await healthApi.onRequestGet();
assert('KV 健康检查正常', healthRes.status === 200 && (await parseJson(healthRes)).kv === true);

const originalKv = globalThis.my_kv;
delete globalThis.my_kv;
const unhealthyRes = await healthApi.onRequestGet();
assert('KV 未绑定时返回明确错误', unhealthyRes.status === 503 && (await parseJson(unhealthyRes)).code === 'KV_UNAVAILABLE');
const unavailableLoginRes = await login.onRequestPost({
  request: {
    url: 'https://example.com/login',
    json: async () => ({ username: 'wcx', password: 'dashuaige' }),
    headers: { get: () => '' }
  }
});
assert('KV 未绑定时登录不再返回 545', unavailableLoginRes.status === 503);
globalThis.my_kv = originalKv;

// --- 测试10：密码哈希正确性（与代码内置哈希一致） ---
assert('dashuaige 哈希匹配', sha256('dashuaige') === '2f8c5ef83921f63e1e5b353b55dbaed44c68f87b811d469bbd167d3b867bd3a8');
assert('123456 哈希匹配', sha256('123456') === '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92');
assert('test123 哈希匹配', sha256('test123') === 'ecd71870d1963316a97e3ac3408c9835ad8cf0f3c1bc703527c30265534f75ae');

console.log(`\n测试结果：${pass} 通过，${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
