// EdgeOne Pages Edge Function - 登录接口
// 路由：POST /login
// 数据存储在 EdgeOne KV（绑定变量名 my_kv）

// 默认账号（密码以 SHA-256 哈希存储）
const DEFAULT_USERS = [
  { username: 'wcx', passwordHash: '2f8c5ef83921f63e1e5b353b55dbaed44c68f87b811d469bbd167d3b867bd3a8', email: 'wcx@example.com' },
  { username: 'admin', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', email: 'admin@example.com' },
  { username: 'test', passwordHash: 'ecd71870d1963316a97e3ac3408c9835ad8cf0f3c1bc703527c30265534f75ae', email: 'test@example.com' }
];

// SHA-256 哈希（Web Crypto API）
async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// 读取用户列表（懒初始化）
async function getUsers() {
  const raw = await my_kv.get('users');
  if (raw) return JSON.parse(raw);
  await my_kv.put('users', JSON.stringify(DEFAULT_USERS));
  return DEFAULT_USERS;
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8', ...extraHeaders }
  });
}

export async function onRequestPost({ request }) {
  // 解析请求体
  let body = {};
  try { body = await request.json(); } catch (e) {}

  const username = (body.username || '').toString().trim();
  const password = (body.password || '').toString();

  if (!username || !password) {
    return jsonResponse({ success: false, redirect: '/fail.html' });
  }

  const users = await getUsers();
  const passwordHash = await sha256(password);
  const user = users.find(u => u.username === username && u.passwordHash === passwordHash);

  if (!user) {
    // 登录失败
    return jsonResponse({ success: false, redirect: '/fail.html' });
  }

  // 登录成功：生成会话并写入 KV + Cookie
  const sessionId = crypto.randomUUID();
  await my_kv.put(`session:${sessionId}`, JSON.stringify({
    username: user.username,
    email: user.email
  }));

  return jsonResponse({ success: true, redirect: '/success.html' }, 200, {
    'Set-Cookie': `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`
  });
}
