// EdgeOne Pages Edge Function - 用户列表与新增用户
// 路由：GET  /api/users （登录即可查看）
//       POST /api/users （仅管理员）

// 默认账号（与 login.js / register.js 保持一致，修改时必须同步）
const DEFAULT_USERS = [
  { id: 1, username: 'wcx', passwordHash: '2f8c5ef83921f63e1e5b353b55dbaed44c68f87b811d469bbd167d3b867bd3a8', email: 'wcx@example.com', role: 'user', created_at: '2026-09-14 00:00:00' },
  { id: 2, username: 'admin', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', email: 'admin@example.com', role: 'admin', created_at: '2026-09-14 00:00:00' },
  { id: 3, username: 'test', passwordHash: 'ecd71870d1963316a97e3ac3408c9835ad8cf0f3c1bc703527c30265534f75ae', email: 'test@example.com', role: 'user', created_at: '2026-09-14 00:00:00' }
];

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;
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

function validateNewUser({ username, password, email }) {
  if (!USERNAME_PATTERN.test(username)) {
    return '用户名需为 3-20 位字母、数字或下划线';
  }
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return `密码长度需为 ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} 位`;
  }
  if (email && (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))) {
    return '邮箱格式不正确';
  }
  return null;
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

// 读取用户列表（懒初始化），返回补齐 id 后的数组
async function loadUsers() {
  const raw = await my_kv.get('users');
  if (raw) {
    return JSON.parse(raw).map(withRole);
  }

  await my_kv.put('users', JSON.stringify(DEFAULT_USERS));
  return DEFAULT_USERS.map(withRole);
}

async function saveUsers(users) {
  await my_kv.put('users', JSON.stringify(users));
}

// 校验会话并取回当前用户（角色实时取自用户列表）
async function authenticate(request) {
  const session = await getSession(getSessionId(request));
  if (!session) return { response: jsonResponse({ error: '未登录' }, 401) };

  const users = await loadUsers();
  const found = users.find((item) => item.id === session.id)
    || users.find((item) => item.username === session.username);

  if (!found) return { response: jsonResponse({ error: '未登录' }, 401) };

  return { session, user: found, users };
}

async function requireAdmin(request) {
  const auth = await authenticate(request);
  if (auth.response) return auth;

  if (normalizeRole(auth.user.role) !== 'admin') {
    return { response: jsonResponse({ error: '需要管理员权限' }, 403) };
  }

  return auth;
}

export async function onRequestGet({ request }) {
  if (typeof my_kv === 'undefined' || !my_kv) {
    return kvUnavailableResponse();
  }

  try {
    const auth = await authenticate(request);
    if (auth.response) return auth.response;

    return jsonResponse(auth.users.map((user, index) => publicUser(user, index + 1)));
  } catch (error) {
    return kvUnavailableResponse();
  }
}

export async function onRequestPost({ request }) {
  if (typeof my_kv === 'undefined' || !my_kv) {
    return kvUnavailableResponse();
  }

  let body = {};
  try { body = await request.json(); } catch (e) {}

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const email = normalizeEmail(body.email);
  const requestedRole = typeof body.role === 'string' && body.role ? body.role : 'user';

  const invalidReason = validateNewUser({ username, password, email });
  if (invalidReason) {
    return jsonResponse({ error: invalidReason }, 400);
  }

  if (!ROLES.has(requestedRole)) {
    return jsonResponse({ error: '角色只能是 user 或 admin' }, 400);
  }

  try {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;

    if (auth.users.some((user) => user.username === username)) {
      return jsonResponse({ error: '该用户名已存在' }, 409);
    }

    if (email && auth.users.some((user) => normalizeEmail(user.email) === email)) {
      return jsonResponse({ error: '该邮箱已被使用' }, 409);
    }

    const nextId = auth.users.reduce((max, user) => Math.max(max, Number(user.id) || 0), 0) + 1;
    const created = {
      id: nextId,
      username,
      passwordHash: await sha256(password),
      email,
      role: requestedRole,
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };

    await saveUsers([...auth.users, created]);
    return jsonResponse(publicUser(created), 201);
  } catch (error) {
    return kvUnavailableResponse();
  }
}

// 仅供测试校验三份默认账号副本是否一致
export { DEFAULT_USERS };
