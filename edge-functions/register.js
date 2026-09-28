// EdgeOne Pages Edge Function - 注册
// 路由：POST /register
// 说明：开放注册，注册出来的账号角色固定为 user。
//       云端暂未实现注册限流（需要额外的 KV 计数键），如需限制请在网关或 KV 中补充。

// 默认账号（与 login.js / api/users.js 保持一致，修改时必须同步）
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
    success: false,
    code: 'KV_UNAVAILABLE',
    error: '云端 KV 未绑定或不可用，请检查变量名 my_kv'
  }, 503);
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
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

async function loadUsers() {
  const raw = await my_kv.get('users');
  if (raw) {
    return JSON.parse(raw).map((user, index) => ({
      ...user,
      id: user.id ?? index + 1,
      created_at: user.created_at || user.createdAt || ''
    }));
  }

  await my_kv.put('users', JSON.stringify(DEFAULT_USERS));
  return DEFAULT_USERS.map((user) => ({ ...user }));
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

  const invalidReason = validateNewUser({ username, password, email });
  if (invalidReason) {
    return jsonResponse({ success: false, error: invalidReason }, 400);
  }

  try {
    const users = await loadUsers();

    if (users.some((user) => user.username === username)) {
      return jsonResponse({ success: false, error: '该用户名已被注册' }, 409);
    }

    if (email && users.some((user) => normalizeEmail(user.email) === email)) {
      return jsonResponse({ success: false, error: '该邮箱已被使用' }, 409);
    }

    const nextId = users.reduce((max, user) => Math.max(max, Number(user.id) || 0), 0) + 1;
    const created = {
      id: nextId,
      username,
      passwordHash: await sha256(password),
      email,
      role: 'user',
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };

    await my_kv.put('users', JSON.stringify([...users, created]));

    return jsonResponse({
      success: true,
      message: '注册成功，请使用新账号登录',
      redirect: '/login.html',
      user: { id: created.id, username: created.username, email: created.email, role: created.role }
    }, 201);
  } catch (error) {
    return kvUnavailableResponse();
  }
}

// 仅供测试校验三份默认账号副本是否一致
export { DEFAULT_USERS };
