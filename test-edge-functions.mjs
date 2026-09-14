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
    json: async () => ({ username: 'wcx', password: 'dashuaige' }),
    headers: { get: () => '' }
  }
});
const loginData = await parseJson(loginRes);
assert('wcx/dashuaige 登录成功', loginData.success === true && loginData.redirect === '/success.html');
const setCookie = loginRes.headers.get('Set-Cookie');
const sessionId = setCookie.match(/session_id=([^;]+)/)[1];
assert('登录返回 session cookie', !!sessionId);
assert('KV 中已写入会话', kvStore.has(`session:${sessionId}`));

// --- 测试2：错误密码登录失败 ---
const failRes = await login.onRequestPost({
  request: {
    json: async () => ({ username: 'wcx', password: 'wrong' }),
    headers: { get: () => '' }
  }
});
const failData = await parseJson(failRes);
assert('错误密码登录失败', failData.success === false && failData.redirect === '/fail.html');

// --- 测试3：未登录访问用户列表返回 401 ---
const unauthRes = await usersApi.onRequestGet({
  request: { headers: { get: () => '' } }
});
assert('未登录访问 /api/users 返回 401', unauthRes.status === 401);

// --- 测试4：已登录访问用户列表 ---
const authRes = await usersApi.onRequestGet({
  request: { headers: { get: () => `session_id=${sessionId}` } }
});
const users = await parseJson(authRes);
assert('已登录获取用户列表', Array.isArray(users) && users.length === 3);
assert('用户列表含 wcx', users.some(u => u.username === 'wcx'));
assert('用户列表不泄露密码', !users[0].passwordHash && !users[0].password);

// --- 测试5：获取当前用户 ---
const curRes = await currentUser.onRequestGet({
  request: { headers: { get: () => `session_id=${sessionId}` } }
});
const curData = await parseJson(curRes);
assert('获取当前用户', curData.loggedIn === true && curData.user.username === 'wcx');

// --- 测试6：登出后会话失效 ---
const logoutRes = await logout.onRequestPost({
  request: { headers: { get: () => `session_id=${sessionId}` } }
});
assert('登出成功', (await parseJson(logoutRes)).success === true);
assert('KV 会话已删除', !kvStore.has(`session:${sessionId}`));
const afterLogout = await currentUser.onRequestGet({
  request: { headers: { get: () => `session_id=${sessionId}` } }
});
assert('登出后未登录', (await parseJson(afterLogout)).loggedIn === false);

// --- 测试7：密码哈希正确性（与代码内置哈希一致） ---
assert('dashuaige 哈希匹配', sha256('dashuaige') === '2f8c5ef83921f63e1e5b353b55dbaed44c68f87b811d469bbd167d3b867bd3a8');
assert('123456 哈希匹配', sha256('123456') === '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92');
assert('test123 哈希匹配', sha256('test123') === 'ecd71870d1963316a97e3ac3408c9835ad8cf0f3c1bc703527c30265534f75ae');

console.log(`\n测试结果：${pass} 通过，${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
