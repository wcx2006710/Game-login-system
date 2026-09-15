// EdgeOne Pages Edge Function - 云端运行环境诊断
// 路由：GET /api/health

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

export async function onRequestGet() {
  if (typeof my_kv === 'undefined' || !my_kv) {
    return jsonResponse({
      ok: false,
      kv: false,
      code: 'KV_UNAVAILABLE',
      error: 'KV 未绑定，请在 EdgeOne 项目中绑定变量名 my_kv'
    }, 503);
  }

  try {
    await my_kv.get('__health_check__');
    return jsonResponse({ ok: true, kv: true });
  } catch (error) {
    return jsonResponse({
      ok: false,
      kv: true,
      code: 'KV_ERROR',
      error: String(error?.message || error)
    }, 503);
  }
}
