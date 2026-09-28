// EdgeOne Pages Edge Function - 个人中心：修改自己的密码
// 路由：POST /api/change-password

const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;
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

function normalizeRole(value, fallback = 'user') {
  return typeof value === 'string' && ROLES.has(value) ? value : fallback;
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
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

export async function onRequestPost({ request }) {
  if (typeof my_kv === 'undefined' || !my_kv) {
    return kvUnavailableResponse();
  }

  let body = {};
  try { body = await request.json(); } catch (e) {}

  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!currentPassword || !newPassword) {
    return jsonResponse({ error: '请填写当前密码和新密码' }, 400);
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > MAX_PASSWORD_LENGTH) {
    return jsonResponse({
      error: `新密码长度需为 ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} 位`
    }, 400);
  }

  if (newPassword === currentPassword) {
    return jsonResponse({ error: '新密码不能与当前密码相同' }, 400);
  }

  try {
    const auth = await authenticate(request);
    if (auth.response) return auth.response;

    const currentHash = await sha256(currentPassword);
    if (currentHash !== auth.user.passwordHash) {
      return jsonResponse({ error: '当前密码不正确' }, 400);
    }

    const updated = { ...auth.user, passwordHash: await sha256(newPassword) };
    await my_kv.put('users', JSON.stringify(
      auth.users.map((user) => (user.id === auth.user.id ? updated : user))
    ));

    return jsonResponse({ success: true, message: '密码已更新，请使用新密码重新登录' });
  } catch (error) {
    return kvUnavailableResponse();
  }
}
