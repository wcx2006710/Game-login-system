// EdgeOne Pages Edge Function - 获取当前登录用户
// 路由：GET /api/current-user

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
    loggedIn: false,
    code: 'KV_UNAVAILABLE',
    error: '云端 KV 未绑定或不可用，请检查变量名 my_kv'
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
  return value === 'admin' || value === 'user' ? value : fallback;
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

// 角色实时取自用户列表，保证管理员改了角色后立即生效
async function resolveUser(session) {
  const raw = await my_kv.get('users');
  const users = raw ? JSON.parse(raw).map(withRole) : null;

  const found = Array.isArray(users)
    ? users.find((item) => item.id === session.id) || users.find((item) => item.username === session.username)
    : null;

  if (found) return publicUser(found, session.id);

  return {
    id: session.id ?? null,
    username: session.username,
    email: session.email || '',
    role: normalizeRole(session.role),
    created_at: session.created_at || ''
  };
}

export async function onRequestGet({ request }) {
  const sessionId = getSessionId(request);

  if (!sessionId) {
    return jsonResponse({ loggedIn: false });
  }

  if (typeof my_kv === 'undefined' || !my_kv) {
    return kvUnavailableResponse();
  }

  try {
    const session = await getSession(sessionId);
    if (session) {
      return jsonResponse({ loggedIn: true, user: await resolveUser(session) });
    }
  } catch (error) {
    return kvUnavailableResponse();
  }

  return jsonResponse({ loggedIn: false });
}
