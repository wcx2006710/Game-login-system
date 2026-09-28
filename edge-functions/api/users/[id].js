// EdgeOne Pages Edge Function - 管理员修改 / 删除用户
// 路由：PUT    /api/users/:id
//       DELETE /api/users/:id
// 说明：本文件只读写 KV 中已有的 users 列表；列表为空时按「用户不存在」处理，
//       懒初始化由 api/users.js 与 register.js 负责。

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

async function saveUsers(users) {
  await my_kv.put('users', JSON.stringify(users));
}

async function requireAdmin(request) {
  const session = await getSession(getSessionId(request));
  if (!session) return { response: jsonResponse({ error: '未登录' }, 401) };

  const users = await loadUsers();
  const found = users.find((item) => item.id === session.id)
    || users.find((item) => item.username === session.username);

  if (!found) return { response: jsonResponse({ error: '未登录' }, 401) };

  if (normalizeRole(found.role) !== 'admin') {
    return { response: jsonResponse({ error: '需要管理员权限' }, 403) };
  }

  return { session, user: found, users };
}

function parseUserId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function onRequestPut({ request, params }) {
  if (typeof my_kv === 'undefined' || !my_kv) {
    return kvUnavailableResponse();
  }

  const userId = parseUserId(params?.id);
  if (!userId) {
    return jsonResponse({ error: '用户 ID 不合法' }, 400);
  }

  let body = {};
  try { body = await request.json(); } catch (e) {}

  try {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;

    const index = auth.users.findIndex((user) => user.id === userId);
    if (index === -1) {
      return jsonResponse({ error: '用户不存在' }, 404);
    }

    const target = auth.users[index];
    const updates = {};

    if (Object.hasOwn(body, 'email')) {
      const email = normalizeEmail(body.email);
      if (email && (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))) {
        return jsonResponse({ error: '邮箱格式不正确' }, 400);
      }

      const emailTaken = email && auth.users.some(
        (user) => user.id !== userId && normalizeEmail(user.email) === email
      );
      if (emailTaken) {
        return jsonResponse({ error: '该邮箱已被使用' }, 409);
      }

      updates.email = email;
    }

    if (Object.hasOwn(body, 'role')) {
      if (!ROLES.has(body.role)) {
        return jsonResponse({ error: '角色只能是 user 或 admin' }, 400);
      }
      if (userId === auth.user.id && body.role !== 'admin') {
        return jsonResponse({ error: '不能取消自己的管理员权限' }, 400);
      }

      updates.role = body.role;
    }

    if (Object.hasOwn(body, 'password')) {
      const password = typeof body.password === 'string' ? body.password : '';
      if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
        return jsonResponse({
          error: `密码长度需为 ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} 位`
        }, 400);
      }

      updates.passwordHash = await sha256(password);
    }

    if (Object.keys(updates).length === 0) {
      return jsonResponse({ error: '没有需要更新的字段' }, 400);
    }

    const updated = { ...target, ...updates };
    const nextUsers = [...auth.users];
    nextUsers[index] = updated;

    await saveUsers(nextUsers);
    return jsonResponse(publicUser(updated));
  } catch (error) {
    return kvUnavailableResponse();
  }
}

export async function onRequestDelete({ request, params }) {
  if (typeof my_kv === 'undefined' || !my_kv) {
    return kvUnavailableResponse();
  }

  const userId = parseUserId(params?.id);
  if (!userId) {
    return jsonResponse({ error: '用户 ID 不合法' }, 400);
  }

  try {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;

    const target = auth.users.find((user) => user.id === userId);
    if (!target) {
      return jsonResponse({ error: '用户不存在' }, 404);
    }

    if (userId === auth.user.id) {
      return jsonResponse({ error: '不能删除当前登录的账号' }, 400);
    }

    if (target.username === 'admin') {
      return jsonResponse({ error: '默认管理员账号不可删除' }, 400);
    }

    await saveUsers(auth.users.filter((user) => user.id !== userId));
    return jsonResponse({ success: true, deletedId: userId });
  } catch (error) {
    return kvUnavailableResponse();
  }
}
