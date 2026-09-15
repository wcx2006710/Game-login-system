// EdgeOne Pages Edge Function - 获取用户列表（需登录）
// 路由：GET /api/users

// 默认账号（与 login.js 保持一致，用于懒初始化）
const DEFAULT_USERS = [
  { id: 1, username: 'wcx', passwordHash: '2f8c5ef83921f63e1e5b353b55dbaed44c68f87b811d469bbd167d3b867bd3a8', email: 'wcx@example.com', created_at: '2026-09-14 00:00:00' },
  { id: 2, username: 'admin', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', email: 'admin@example.com', created_at: '2026-09-14 00:00:00' },
  { id: 3, username: 'test', passwordHash: 'ecd71870d1963316a97e3ac3408c9835ad8cf0f3c1bc703527c30265534f75ae', email: 'test@example.com', created_at: '2026-09-14 00:00:00' }
];

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function kvUnavailableResponse() {
  return jsonResponse({
    error: '云端 KV 未绑定或不可用，请检查变量名 my_kv',
    code: 'KV_UNAVAILABLE'
  }, 503);
}

function getSessionId(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)session_id=([^;]+)/);
  if (!match) return '';

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

async function isLoggedIn(sessionId) {
  if (!sessionId) return false;

  const key = `session:${sessionId}`;
  const raw = await my_kv.get(key);
  if (!raw) return false;

  const session = JSON.parse(raw);
  if (!session.expiresAt || session.expiresAt <= Date.now()) {
    await my_kv.delete(key);
    return false;
  }

  return true;
}

export async function onRequestGet({ request }) {
  const sessionId = getSessionId(request);
  if (!sessionId) {
    return jsonResponse({ error: '未登录' }, 401);
  }

  if (typeof my_kv === 'undefined' || !my_kv) {
    return kvUnavailableResponse();
  }

  let loggedIn;
  try {
    loggedIn = await isLoggedIn(sessionId);
  } catch (error) {
    return kvUnavailableResponse();
  }

  if (!loggedIn) {
    return jsonResponse({ error: '未登录' }, 401);
  }

  // 读取用户列表（懒初始化）
  let users = [];
  try {
    const raw = await my_kv.get('users');
    if (raw) {
      users = JSON.parse(raw);
    } else {
      users = DEFAULT_USERS;
      await my_kv.put('users', JSON.stringify(DEFAULT_USERS));
    }
  } catch (error) {
    return kvUnavailableResponse();
  }

  // 返回安全字段（不包含密码哈希）
  const list = users.map((user, index) => ({
    id: user.id ?? index + 1,
    username: user.username,
    email: user.email,
    created_at: user.created_at || user.createdAt || ''
  }));
  return jsonResponse(list);
}
