// EdgeOne Pages Edge Function - 获取当前登录用户
// 路由：GET /api/current-user

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8' }
  });
}

export async function onRequestGet({ request }) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session_id=([^;]+)/);

  if (match) {
    try {
      const raw = await my_kv.get(`session:${match[1]}`);
      if (raw) {
        return jsonResponse({ loggedIn: true, user: JSON.parse(raw) });
      }
    } catch (e) {}
  }

  return jsonResponse({ loggedIn: false });
}
