// EdgeOne Pages Edge Function - 个人中心：修改自己的邮箱
// 路由：PUT /api/profile

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 120;
const ROLES = new Set(['user', 'admin']);

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

async function getSession(sessionId) {
  if (!sessionId) return null;

  const key = `session:${sessionId}`;
  const raw = await my_kv.get(key);
  if (!raw) return null;

  const session = JSON.parse(raw);
  if (!session.expiresAt || session.expiresAt <= Date.now()) {
    await my_kv.delete(key);
    return null;
  }

  return session;
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeRole(value, fallback = 'user') {
  return typeof value === 'string' && ROLES.has(value) ? value : fallback;
}

function publicUser(row, fallbackId) {
  return {
    id: row.id ?? fallbackId ?? null,
    username: row.username,
    email: row.email || '',
    role: normalizeRole(row.role),
    created_at: row.created_at || row.createdAt || ''
  };
}

// 旧数据补 role：默认 admin 账号视为管理员
function withRole(user, index) {
  return {
    ...user,
    id: user.id ?? index + 1,
    role: normalizeRole(user.role, user.username === 'admin' ? 'admin' : 'user'),
    created_at: user.created_at || user.createdAt || ''
  };
}

async function loadUsers() {
  const raw = await my_kv.get('users');
  if (!raw) return [];

  return JSON.parse(raw).map(withRole);
}

async function authenticate(request) {
  const session = await getSession(getSessionId(request));
  if (!session) return { response: jsonResponse({ error: '未登录' }, 401) };

  const users = await loadUsers();
  const found = users.find((item) => item.id === session.id)
    || users.find((item) => item.username === session.username);

  if (!found) return { response: jsonResponse({ error: '未登录' }, 401) };

  return { session, user: found, users };
}

export async function onRequestPut({ request }) {
  if (typeof my_kv === 'undefined' || !my_kv) {
    return kvUnavailableResponse();
  }

  let body = {};
  try { body = await request.json(); } catch (e) {}

  if (!Object.hasOwn(body, 'email')) {
    return jsonResponse({ error: '没有需要更新的字段' }, 400);
  }

  const email = normalizeEmail(body.email);
  if (email && (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))) {
    return jsonResponse({ error: '邮箱格式不正确' }, 400);
  }

  try {
    const auth = await authenticate(request);
    if (auth.response) return auth.response;

    const emailTaken = email && auth.users.some(
      (user) => user.id !== auth.user.id && normalizeEmail(user.email) === email
    );
    if (emailTaken) {
      return jsonResponse({ error: '该邮箱已被使用' }, 409);
    }

    const updated = { ...auth.user, email };
    await my_kv.put('users', JSON.stringify(
      auth.users.map((user) => (user.id === auth.user.id ? updated : user))
    ));

    return jsonResponse({ success: true, user: publicUser(updated) });
  } catch (error) {
    return kvUnavailableResponse();
  }
}
