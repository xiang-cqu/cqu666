/* ============================================================
   EdgeOne 边缘函数 —— AI 问答安全代理
   路由：/api/ai（对应 functions/api/ai.js）
   作用：前端只把 messages 发到这里，由边缘函数携带环境变量
        API_KEY 代调用智谱 GLM 大模型，密钥永不下发到浏览器。
   ============================================================ */

const AI_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL = 'glm-4-flash';

// 统一跨域响应头
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function errorResponse() {
  return new Response(JSON.stringify({ error: 'AI service error' }), {
    status: 503,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders()
    }
  });
}

// POST /api/ai  —— 前端唯一入口
export async function onRequestPost(context) {
  try {
    // 密钥只从 EdgeOne 控制台配置的环境变量读取，不写死在代码里
    const API_KEY = context.env && context.env.API_KEY;
    if (!API_KEY) return errorResponse();

    // 解析前端请求体，只接收 messages 数组
    let payload = {};
    try {
      payload = await context.request.json();
    } catch (e) {
      return errorResponse();
    }
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    if (messages.length === 0) return errorResponse();

    // 是否流式：前端 askAIStream / callAIAPIStream 会传 stream:true
    const wantStream = payload.stream === true;

    // 代调用智谱大模型（流式时透传 stream 参数，由上游返回 SSE）
    const upstream = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        ...(wantStream ? { stream: true } : {})
      })
    });

    // 流式：把上游 ReadableStream 原样透传给前端，不一次性读完
    if (wantStream) {
      if (!upstream.ok || !upstream.body) return errorResponse();
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          ...corsHeaders()
        }
      });
    }

    // 非流式：原样透传上游响应体与状态码，并附加跨域头
    const raw = await upstream.text();
    return new Response(raw, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...corsHeaders()
      }
    });
  } catch (err) {
    // 网络波动 / 上游异常 → 统一 503，前端会自动降级到本地模板
    return errorResponse();
  }
}

// 兜底：处理 OPTIONS 跨域预检及其余方法
export function onRequest() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}
