// EdgeOne Pages Edge Function - 登出接口
// 路由：POST /logout

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders
    }
  });
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

function clearSessionCookie(request) {
  let secure = '';
  try {
    if (new URL(request.url).protocol === 'https:') secure = '; Secure';
  } catch {}

  return `session_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function onRequestPost({ request }) {
  const sessionId = getSessionId(request);

  if (sessionId) {
    // 删除 KV 中的会话
    try { await my_kv.delete(`session:${sessionId}`); } catch (e) {}
  }

  return jsonResponse({ success: true }, 200, {
    'Set-Cookie': clearSessionCookie(request)
  });
}
