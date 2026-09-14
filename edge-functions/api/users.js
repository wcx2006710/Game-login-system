// EdgeOne Pages Edge Function - 获取用户列表（需登录）
// 路由：GET /api/users

// 默认账号（与 login.js 保持一致，用于懒初始化）
const DEFAULT_USERS = [
  { username: 'wcx', passwordHash: '2f8c5ef83921f63e1e5b353b55dbaed44c68f87b811d469bbd167d3b867bd3a8', email: 'wcx@example.com' },
  { username: 'admin', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', email: 'admin@example.com' },
  { username: 'test', passwordHash: 'ecd71870d1963316a97e3ac3408c9835ad8cf0f3c1bc703527c30265534f75ae', email: 'test@example.com' }
];

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8' }
  });
}

export async function onRequestGet({ request }) {
  // 验证登录状态
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session_id=([^;]+)/);

  let loggedIn = false;
  if (match) {
    try {
      const raw = await my_kv.get(`session:${match[1]}`);
      loggedIn = !!raw;
    } catch (e) {}
  }

  if (!loggedIn) {
    return jsonResponse({ error: '未登录' }, 401);
  }

  // 读取用户列表（懒初始化）
  let users = [];
  try {
    const raw = await my_kv.get('users');
    users = raw ? JSON.parse(raw) : DEFAULT_USERS;
  } catch (e) {}

  // 返回安全字段（不包含密码哈希）
  const list = users.map(u => ({ username: u.username, email: u.email }));
  return jsonResponse(list);
}
