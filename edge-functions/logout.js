// EdgeOne Pages Edge Function - 登出接口
// 路由：POST /logout

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8', ...extraHeaders }
  });
}

export async function onRequestPost({ request }) {
  // 读取 Cookie 中的 session_id
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session_id=([^;]+)/);

  if (match) {
    // 删除 KV 中的会话
    try { await my_kv.delete(`session:${match[1]}`); } catch (e) {}
  }

  return jsonResponse({ success: true }, 200, {
    'Set-Cookie': 'session_id=; Path=/; HttpOnly; Max-Age=0'
  });
}
