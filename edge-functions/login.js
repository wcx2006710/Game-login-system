// EdgeOne Pages Edge Function - 登录接口
// 路由：POST /login
// 数据存储在 EdgeOne KV（绑定变量名 my_kv）

const SESSION_MAX_AGE_SECONDS = 60 * 60;

class KvUnavailableError extends Error {}

// 默认账号（密码以 SHA-256 哈希存储）
const DEFAULT_USERS = [
  { id: 1, username: 'wcx', passwordHash: '2f8c5ef83921f63e1e5b353b55dbaed44c68f87b811d469bbd167d3b867bd3a8', email: 'wcx@example.com', created_at: '2026-09-14 00:00:00' },
  { id: 2, username: 'admin', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', email: 'admin@example.com', created_at: '2026-09-14 00:00:00' },
  { id: 3, username: 'test', passwordHash: 'ecd71870d1963316a97e3ac3408c9835ad8cf0f3c1bc703527c30265534f75ae', email: 'test@example.com', created_at: '2026-09-14 00:00:00' }
];

// SHA-256 哈希（Web Crypto API）
async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// 读取用户列表（懒初始化）
async function getUsers() {
  if (typeof my_kv === 'undefined' || !my_kv) {
    throw new KvUnavailableError();
  }

  const raw = await my_kv.get('users');
  if (raw) {
    return JSON.parse(raw).map((user, index) => ({
      ...user,
      id: user.id ?? index + 1,
      created_at: user.created_at || user.createdAt || ''
    }));
  }
  await my_kv.put('users', JSON.stringify(DEFAULT_USERS));
  return DEFAULT_USERS;
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders
    }
  });
}

function isSecureRequest(request) {
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

function createSessionCookie(sessionId, request) {
  const secure = isSecureRequest(request) ? '; Secure' : '';
  return `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
}

export async function onRequestPost({ request }) {
  // 解析请求体
  let body = {};
  try { body = await request.json(); } catch (e) {}

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username || !password) {
    return jsonResponse({ success: false, error: '请输入用户名和密码' }, 400);
  }

  let users;
  try {
    users = await getUsers();
  } catch (error) {
    return jsonResponse({
      success: false,
      code: error instanceof KvUnavailableError ? 'KV_UNAVAILABLE' : 'KV_ERROR',
      error: error instanceof KvUnavailableError
        ? '云端 KV 未绑定或不可用，请检查变量名 my_kv'
        : '云端 KV 读取失败，请查看 EdgeOne 函数日志'
    }, 503);
  }

  const passwordHash = await sha256(password);
  const user = users.find(u => u.username === username && u.passwordHash === passwordHash);

  if (!user) {
    // 登录失败
    return jsonResponse({
      success: false,
      error: '用户名或密码错误'
    }, 401);
  }

  // 登录成功：生成会话并写入 KV + Cookie
  const sessionId = crypto.randomUUID();
  try {
    await my_kv.put(`session:${sessionId}`, JSON.stringify({
      id: user.id,
      username: user.username,
      email: user.email,
      expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000
    }));
  } catch (error) {
    return jsonResponse({
      success: false,
      code: 'KV_UNAVAILABLE',
      error: '云端 KV 写入失败，请检查绑定配置'
    }, 503);
  }

  return jsonResponse({ success: true, redirect: '/success.html' }, 200, {
    'Set-Cookie': createSessionCookie(sessionId, request)
  });
}
