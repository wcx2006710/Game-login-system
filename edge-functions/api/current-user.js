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
      return jsonResponse({
        loggedIn: true,
        user: {
          id: session.id,
          username: session.username,
          email: session.email
        }
      });
    }
  } catch (error) {
    return kvUnavailableResponse();
  }

  return jsonResponse({ loggedIn: false });
}
