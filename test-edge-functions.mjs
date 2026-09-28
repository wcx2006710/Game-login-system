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
const register = await import('./edge-functions/register.js');
const userById = await import('./edge-functions/api/users/[id].js');
const profileApi = await import('./edge-functions/api/profile.js');
const changePasswordApi = await import('./edge-functions/api/change-password.js');

// 请求桩
const getReq = (cookie = '') => ({
  request: { url: 'https://example.com/', headers: { get: () => cookie } }
});
const postReq = (body, cookie = '') => ({
  request: { url: 'https://example.com/', json: async () => body, headers: { get: () => cookie } }
});
const sessionCookieOf = (response) =>
  `session_id=${response.headers.get('Set-Cookie').match(/session_id=([^;]+)/)[1]}`;

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

const unavailableCurrentRes = await currentUser.onRequestGet({
  request: {
    url: 'https://example.com/api/current-user',
    headers: { get: () => 'session_id=missing-kv-session' }
  }
});
assert(
  'KV 未绑定时当前用户接口返回明确错误',
  unavailableCurrentRes.status === 503
    && (await parseJson(unavailableCurrentRes)).code === 'KV_UNAVAILABLE'
);

const unavailableUsersRes = await usersApi.onRequestGet({
  request: {
    url: 'https://example.com/api/users',
    headers: { get: () => 'session_id=missing-kv-session' }
  }
});
assert(
  'KV 未绑定时用户列表接口返回明确错误',
  unavailableUsersRes.status === 503
    && (await parseJson(unavailableUsersRes)).code === 'KV_UNAVAILABLE'
);
globalThis.my_kv = originalKv;

// --- 测试10：密码哈希正确性（与代码内置哈希一致） ---
assert('dashuaige 哈希匹配', sha256('dashuaige') === '2f8c5ef83921f63e1e5b353b55dbaed44c68f87b811d469bbd167d3b867bd3a8');
assert('123456 哈希匹配', sha256('123456') === '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92');
assert('test123 哈希匹配', sha256('test123') === 'ecd71870d1963316a97e3ac3408c9835ad8cf0f3c1bc703527c30265534f75ae');

// ==================== 注册 / 用户管理 / 个人中心 ====================

// --- 测试11：云端注册 ---
kvStore.clear();

assert('注册：非法用户名返回 400',
  (await register.onRequestPost(postReq({ username: 'ab', password: 'secret123' }))).status === 400);
assert('注册：密码过短返回 400',
  (await register.onRequestPost(postReq({ username: 'weakuser', password: '123' }))).status === 400);
assert('注册：邮箱格式错误返回 400',
  (await register.onRequestPost(postReq({ username: 'badmail', password: 'secret123', email: 'nope' }))).status === 400);

const regOk = await register.onRequestPost(
  postReq({ username: 'clouduser', password: 'cloud-pass-123', email: 'Cloud@Test.com' })
);
const regOkData = await parseJson(regOk);
assert('注册：成功返回 201', regOk.status === 201 && regOkData.success === true);
assert('注册：角色为普通用户', regOkData.user.role === 'user');
assert('注册：邮箱小写归一', regOkData.user.email === 'cloud@test.com');
assert('注册：返回登录页跳转', regOkData.redirect === '/login.html');

assert('注册：重复用户名返回 409',
  (await register.onRequestPost(postReq({ username: 'clouduser', password: 'another-pass' }))).status === 409);
assert('注册：重复邮箱返回 409',
  (await register.onRequestPost(postReq({ username: 'otheruser', password: 'another-pass', email: 'cloud@test.com' }))).status === 409);

// --- 测试12：注册的账号可以登录并拿到角色 ---
const cloudLogin = await login.onRequestPost(postReq({ username: 'clouduser', password: 'cloud-pass-123' }));
assert('注册的新账号可以登录', cloudLogin.status === 200);
const cloudCookie = sessionCookieOf(cloudLogin);

const cloudCu = await parseJson(await currentUser.onRequestGet(getReq(cloudCookie)));
assert('current-user 返回 role=user', cloudCu.loggedIn === true && cloudCu.user.role === 'user');

// --- 测试13：普通用户与未登录不能管理用户 ---
assert('普通用户建用户返回 403',
  (await usersApi.onRequestPost(postReq({ username: 'nobody', password: 'nobody123' }, cloudCookie))).status === 403);
assert('未登录建用户返回 401',
  (await usersApi.onRequestPost(postReq({ username: 'nobody', password: 'nobody123' }))).status === 401);

// --- 测试14：管理员登录、角色与列表 ---
const adminLogin = await login.onRequestPost(postReq({ username: 'admin', password: '123456' }));
assert('admin 登录成功', adminLogin.status === 200);
const adminCookie = sessionCookieOf(adminLogin);

const adminCu = await parseJson(await currentUser.onRequestGet(getReq(adminCookie)));
assert('admin 角色为 admin', adminCu.user.role === 'admin');

const listWithRole = await parseJson(await usersApi.onRequestGet(getReq(adminCookie)));
assert('用户列表带 role 字段', listWithRole.every((u) => u.role === 'user' || u.role === 'admin'));
assert('用户列表不泄露密码哈希', listWithRole.every((u) => !u.passwordHash && !u.password));
assert('默认 admin 在列表中角色为 admin',
  listWithRole.find((u) => u.username === 'admin')?.role === 'admin');

// --- 测试15：管理员新增用户 ---
const adminCreate = await usersApi.onRequestPost(postReq({
  username: 'cloud_bob', password: 'bob-pass-123', email: 'bob@cloud.com', role: 'user'
}, adminCookie));
const bob = await parseJson(adminCreate);
assert('管理员建用户返回 201', adminCreate.status === 201 && bob.username === 'cloud_bob');
const bobId = bob.id;

assert('管理员建重名用户返回 409',
  (await usersApi.onRequestPost(postReq({ username: 'cloud_bob', password: 'bob-pass-123' }, adminCookie))).status === 409);

// --- 测试16：管理员修改用户 ---
const putRole = await userById.onRequestPut({
  ...postReq({ email: 'bob2@cloud.com', role: 'admin' }, adminCookie),
  params: { id: String(bobId) }
});
const putRoleData = await parseJson(putRole);
assert('管理员改角色与邮箱',
  putRole.status === 200 && putRoleData.role === 'admin' && putRoleData.email === 'bob2@cloud.com');

const putPassword = await userById.onRequestPut({
  ...postReq({ password: 'new-cloud-pass' }, adminCookie),
  params: { id: String(bobId) }
});
assert('管理员重置密码返回 200', putPassword.status === 200);

assert('重置后新密码可登录',
  (await login.onRequestPost(postReq({ username: 'cloud_bob', password: 'new-cloud-pass' }))).status === 200);
assert('重置后旧密码失效',
  (await login.onRequestPost(postReq({ username: 'cloud_bob', password: 'bob-pass-123' }))).status === 401);

// --- 测试17：管理员操作护栏 ---
const adminId = listWithRole.find((u) => u.username === 'admin').id;

assert('不能取消自己的管理员权限',
  (await userById.onRequestPut({
    ...postReq({ role: 'user' }, adminCookie),
    params: { id: String(adminId) }
  })).status === 400);

assert('不能删除当前登录账号',
  (await userById.onRequestDelete({ ...getReq(adminCookie), params: { id: String(adminId) } })).status === 400);

const bobLoginForGuard = await login.onRequestPost(postReq({ username: 'cloud_bob', password: 'new-cloud-pass' }));
const bobCookie = sessionCookieOf(bobLoginForGuard);
assert('默认 admin 账号不可删除',
  (await userById.onRequestDelete({ ...getReq(bobCookie), params: { id: String(adminId) } })).status === 400);

assert('删除不存在的用户返回 404',
  (await userById.onRequestDelete({ ...getReq(adminCookie), params: { id: '99999' } })).status === 404);

// --- 测试18：管理员删除用户 ---
const deleteBob = await userById.onRequestDelete({ ...getReq(adminCookie), params: { id: String(bobId) } });
assert('管理员删除用户返回 200', deleteBob.status === 200 && (await parseJson(deleteBob)).success === true);

const listAfterDelete = await parseJson(await usersApi.onRequestGet(getReq(adminCookie)));
assert('删除后列表不再包含该用户', !listAfterDelete.some((u) => u.id === bobId));

// --- 测试19：个人中心改邮箱 ---
assert('个人中心：邮箱格式错误返回 400',
  (await profileApi.onRequestPut({ ...postReq({ email: 'not-an-email' }, cloudCookie) })).status === 400);
assert('个人中心：邮箱被占用返回 409',
  (await profileApi.onRequestPut({ ...postReq({ email: 'admin@example.com' }, cloudCookie) })).status === 409);
assert('个人中心：未登录返回 401',
  (await profileApi.onRequestPut(postReq({ email: 'x@y.com' }))).status === 401);

const profileOk = await profileApi.onRequestPut({ ...postReq({ email: 'CloudNew@Test.com' }, cloudCookie) });
const profileOkData = await parseJson(profileOk);
assert('个人中心：改邮箱成功且小写归一',
  profileOk.status === 200 && profileOkData.user.email === 'cloudnew@test.com');

// --- 测试20：个人中心改密码 ---
assert('改密码：当前密码错误返回 400',
  (await changePasswordApi.onRequestPost(postReq({
    currentPassword: 'wrong-pass', newPassword: 'brand-new-pass'
  }, cloudCookie))).status === 400);
assert('改密码：新密码过短返回 400',
  (await changePasswordApi.onRequestPost(postReq({
    currentPassword: 'cloud-pass-123', newPassword: '123'
  }, cloudCookie))).status === 400);
assert('改密码：新旧相同返回 400',
  (await changePasswordApi.onRequestPost(postReq({
    currentPassword: 'cloud-pass-123', newPassword: 'cloud-pass-123'
  }, cloudCookie))).status === 400);
assert('改密码：未登录返回 401',
  (await changePasswordApi.onRequestPost(postReq({
    currentPassword: 'a', newPassword: 'bbbbbb'
  }))).status === 401);

const cpOk = await changePasswordApi.onRequestPost(postReq({
  currentPassword: 'cloud-pass-123', newPassword: 'brand-new-pass'
}, cloudCookie));
assert('改密码：成功返回 200', cpOk.status === 200 && (await parseJson(cpOk)).success === true);

assert('改密码后旧密码失效',
  (await login.onRequestPost(postReq({ username: 'clouduser', password: 'cloud-pass-123' }))).status === 401);
assert('改密码后新密码可登录',
  (await login.onRequestPost(postReq({ username: 'clouduser', password: 'brand-new-pass' }))).status === 200);

// --- 测试21：三份默认账号副本必须一致 ---
assert('login.js 与 api/users.js 的默认账号一致',
  JSON.stringify(login.DEFAULT_USERS) === JSON.stringify(usersApi.DEFAULT_USERS));
assert('login.js 与 register.js 的默认账号一致',
  JSON.stringify(login.DEFAULT_USERS) === JSON.stringify(register.DEFAULT_USERS));

console.log(`\n测试结果：${pass} 通过，${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
