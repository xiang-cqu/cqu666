/* ============================================================
   ai-core.js — 校园社区公共库（搜索 + AI 问答）
   供 forum.html / search.html / vote.html 等页面复用
   ============================================================ */

// ============================================================
// 直连智谱 AI 开放平台（帽子云纯静态托管，无边缘函数，前端直接请求）
// 上线前：把 API_KEY 替换为你的真实智谱 API Key
// ============================================================
const API_KEY = "【这里填入你的真实API Key】";
const API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const MODEL_NAME = "glm-4-flash";

// 总开关：false = 纯本地降级AI（断网可用，不调用任何外部API）
//         true  = 优先直连真实大模型，失败时自动降级到本地模板
const USE_REAL_API = true;

/* ---------- 1. 精确搜索：标题 / 内容 / 作者名严格匹配 ---------- */
function exactSearch(posts, keyword) {
  if (!keyword || !String(keyword).trim()) return posts.slice();
  const kw = String(keyword).trim().toLowerCase();
  return posts.filter(p =>
    p.content.toLowerCase().includes(kw) ||
    (p.author && p.author.toLowerCase().includes(kw))
  );
}

/* ---------- 2. 模糊搜索：基于同义词库的宽松匹配 ---------- */
function fuzzyMatchPosts(posts, keyword) {
  if (!keyword || !String(keyword).trim()) return posts.slice();
  const kw = String(keyword).trim().toLowerCase();

  // 校园常见同义词库
  const synonymGroups = [
    ['高数', '微积分', '数学', '高等数学', '选课', 'calculus'],
    ['食堂', '饺子', '吃饭', '餐厅', '美食', '好吃', '窗口', '打饭'],
    ['思群', '广场', '夜跑', '跑步', '散步', '锻炼', '晚上']
  ];

  // 判断关键词属于哪组同义词
  const matchedGroup = synonymGroups.find(group =>
    group.some(word => kw.includes(word) || word.includes(kw))
  );

  return posts.filter(p => {
    const text = (p.content + ' ' + (p.author || '')).toLowerCase();
    // 直接包含关键词
    if (text.includes(kw)) return true;
    // 命中同义词组
    if (matchedGroup && matchedGroup.some(word => text.includes(word))) return true;
    return false;
  });
}

/* ============================================================
   3. 本地降级 AI：热度权重排序 + 随机模板 + 真实数据填充
   ============================================================ */

// 把时间字符串换算成“距离今天的天数”（越小越新）
function daysAgo(timeStr) {
  const t = String(timeStr || '');
  if (t.includes('刚刚') || t.includes('分钟前')) return 0;
  if (t.includes('小时前')) return 0;
  if (t.includes('昨天')) return 1;
  const m = t.match(/(\d+)\s*天前/);
  if (m) return parseInt(m[1], 10);
  return 7;   // 无法解析的时间按一周前处理
}

// 热度分 = 点赞数 * 2 - 距离今天的天数 * 0.5
function hotScore(post) {
  return (post.likes || 0) * 2 - daysAgo(post.time) * 0.5;
}

/* ---------- 多维随机词库 ---------- */
const AI_OPENERS = [
  '【AI智能总结】',
  '根据论坛数据分析：',
  '综合近期高赞讨论：',
  '结合时间与热度权重，为你总结：',
  '翻了一圈大家的讨论，为你划重点：'
];
const AI_TRANSITIONS = [
  '同学们普遍关注',
  '近期大家讨论最多的是',
  '热帖反映了大家对',
  '高赞帖子提到了',
  '不少同学都在聊'
];
const AI_CLOSERS = [
  '建议去原帖看看详情。',
  '推荐结合自身情况参考。',
  '希望能帮你解决疑问。',
  '去帖子里和大家一起聊聊吧。',
  '更多细节欢迎到原帖围观。'
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 把帖子标题精简为核心名词短语（去掉“请问”前缀和“怎么样？”等疑问尾巴）
function simplifyTitle(content) {
  let t = String(content || '').trim();
  t = t.replace(/^(请问|求问|求助|想问一下|想问问|问一下|问一下大家)/, '');
  t = t.replace(/[？?！!。…~～\s]+$/g, '');
  t = t.replace(/(怎么样|好不好吃|好不好|哪个好|哪家好|难不难|在哪里|在哪儿|几点|多少|如何|怎么|吗|呢|吧|呀|啊)+$/g, '');
  t = t.replace(/[？?！!。…~～\s]+$/g, '');
  return t || String(content || '').trim();
}

// 本地生成 AI 总结：权重排序取前 1-2 帖，三个词库随机拼装成句
function generateLocalAISummary(question, matchedPosts) {
  if (!matchedPosts || matchedPosts.length === 0) {
    return AI_NO_RESULT_MSG;
  }

  // 热度分从高到低排序，取前 1~2 篇
  const ranked = [...matchedPosts].sort((a, b) => hotScore(b) - hotScore(a));
  const top = ranked.slice(0, Math.min(2, ranked.length));

  // 随机抽取三段句式
  const opener = pickRandom(AI_OPENERS);
  const transition = pickRandom(AI_TRANSITIONS);
  const closer = pickRandom(AI_CLOSERS);

  // 拼装：开场白 + 过渡句 + 《精简标题》+（可选：热度/作者）+（可选：第二帖）+ 结尾
  const p1 = top[0];
  let sentence = `${opener}${transition}《${simplifyTitle(p1.content)}》`;

  if (Math.random() < 0.6) {   // 60% 概率附上热度与作者
    sentence += `（热度：${p1.likes}赞，作者：${p1.author || '匿名'}）`;
  }

  const p2 = top[1];
  if (p2 && Math.random() < 0.5) {   // 50% 概率带出第二高热帖
    sentence += `，此外《${simplifyTitle(p2.content)}》也被反复提及`;
  }

  sentence += `，${closer}`;
  return sentence;
}

/* ============================================================
   5. 流式输出（打字机效果）
   ------------------------------------------------------------
   · streamChatRaw      底层：直连智谱 API（stream:true），按 SSE 逐块解析
   · callAIAPIStream    通用流式版 callAIAPI（失败 throw，由调用方兜底）
   · askAIStream        板块流式版 askAI（失败自动降级本地权重模板）
   · createTextTyper    稳定节奏打字机：任意长度增量都按固定间隔逐字回调
   ============================================================ */

function aiSleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// SSE 增量解析器：每次喂入任意长度文本，返回本次解析出的内容增量数组
// 兼容半包（行尾不完整时残留在 buffer）、[DONE]、markdown/非JSON 噪声行
function createSSEParser() {
  let buffer = '';
  return function (chunk) {
    buffer += chunk;
    const out = [];
    const lines = buffer.split('\n');
    buffer = lines.pop();   // 最后一段可能是不完整的行，留到下次
    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '').trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const choice = json.choices && json.choices[0];
        const piece = (choice && choice.delta && choice.delta.content)
          || (choice && choice.message && choice.message.content)
          || '';
        if (piece) out.push(piece);
      } catch (e) { /* 半包或非 JSON 数据行，忽略 */ }
    }
    return out;
  };
}

/**
 * 稳定节奏打字机：把任意时机到达的文本块，按固定间隔逐片吐出
 * @param {(piece:string)=>void} onTick 每一片文本的回调（直接追加到 DOM）
 * @param {number} interval 吐出间隔 ms
 * @param {number} step 每次吐出的最大字符数
 * 返回 { feed(text), finish() }：finish 在全部缓存文字吐完后 resolve
 */
function createTextTyper(onTick, interval, step) {
  interval = interval || 24;
  step = step || 2;
  let queue = '';
  let timer = null;
  let resolveDone = null;

  function pump() {
    if (timer) return;
    timer = setInterval(() => {
      if (queue) {
        const piece = queue.slice(0, step);
        queue = queue.slice(step);
        try { onTick(piece); } catch (e) {}
      }
      if (!queue) {
        clearInterval(timer);
        timer = null;
        if (resolveDone) { const r = resolveDone; resolveDone = null; r(); }
      }
    }, interval);
  }

  return {
    feed(text) { if (text) { queue += text; pump(); } },
    finish() {
      return new Promise(res => {
        if (!queue && !timer) return res();
        resolveDone = res;
      });
    }
  };
}

/**
 * 底层流式请求：实时通过 onChunk(delta) 吐增量，返回完整文本
 * 环境不支持流式（无 ReadableStream / 上游整块返回 JSON）时自动一次性吐出；
 * 真正失败（断网/503/空响应）时 throw，交由上层降级。
 */
async function streamChatRaw(messages, onChunk, timeoutMs) {
  if (!Array.isArray(messages) || messages.length === 0) throw new Error('messages 不能为空');
  timeoutMs = timeoutMs || 20000;

  const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY
      },
      signal: controller ? controller.signal : undefined,
      body: JSON.stringify({ model: MODEL_NAME, messages, stream: true })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // 运行环境不支持逐块读取 → 退化为一次性 JSON 完整输出（演示不崩溃）
    if (!res.body || typeof res.body.getReader !== 'function') {
      const data = await res.json();
      const content = data.choices && data.choices[0] && data.choices[0].message
        && data.choices[0].message.content;
      if (!content || !content.trim()) throw new Error('AI返回内容为空');
      const text = content.trim();
      if (onChunk) onChunk(text);
      return text;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parse = createSSEParser();
    let full = '';
    let rawAll = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      rawAll += text;
      const deltas = parse(text);
      for (const d of deltas) {
        full += d;
        if (onChunk) onChunk(d);
      }
    }

    if (full.trim()) return full.replace(/^\s+|\s+$/g, '');

    // SSE 没解析出增量：可能上游把流式退化成了整块 JSON，尝试整体解析
    try {
      const data = JSON.parse(rawAll.trim());
      const content = data.choices && data.choices[0] && data.choices[0].message
        && data.choices[0].message.content;
      if (content && content.trim()) {
        const text = content.trim();
        if (onChunk) onChunk(text);
        return text;
      }
    } catch (e) { /* 确实不是 JSON */ }
    throw new Error('流式响应内容为空');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// 通用流式对话（自定义 messages，无本地兜底，失败直接 throw）
async function callAIAPIStream(messages, onChunk, timeoutMs) {
  return streamChatRaw(messages, onChunk, timeoutMs);
}

// 模拟逐字输出：本地降级文案也能享受打字机效果
async function emitSimulatedStream(text, onChunk, step, interval) {
  step = step || 2;
  interval = interval || 24;
  if (!text) return '';
  for (let i = 0; i < text.length; i += step) {
    const piece = text.slice(i, i + step);
    if (onChunk) onChunk(piece);
    await aiSleep(interval);
  }
  return text;
}

/**
 * 板块流式问答（askAI 的流式版）
 * 成功 → 实时 onChunk 增量；断网/503/超时 → 自动降级本地权重模板并模拟逐字输出
 * @returns {Promise<string>} 完整回答文本
 */
async function askAIStream(question, contextData, contextType, onChunk) {
  const type = AI_ROLE_PROMPTS[contextType] ? contextType : 'forum';

  // 板块未命中：统一话术（不调外部接口），仍逐字输出
  if (isContextEmpty(type, contextData)) {
    return emitSimulatedStream(AI_NO_RESULT_MSG, onChunk);
  }

  if (!USE_REAL_API) {
    await aiSleep(600);   // 短暂“思考”节奏
    return emitSimulatedStream(localFallbackAnswer(type, question, contextData), onChunk);
  }

  const systemPrompt = `${AI_ROLE_PROMPTS[type]}
回答控制在100字以内，不要 markdown，纯文本即可。
若提供的数据与用户问题完全无关，请直接回复：${AI_NO_RESULT_MSG}`;

  const userPrompt = `用户提问：${question}

当前板块数据：
${serializeContext(type, contextData)}`;

  try {
    return await streamChatRaw(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      onChunk,
      8000
    );
  } catch (err) {
    // CORS / 断网 / 超时 / 503 → 无缝降级本地权重模板，逐字输出
    console.warn('[ai-core] 流式AI请求失败，启用本地降级模板：', err);
    return emitSimulatedStream(localFallbackAnswer(type, question, contextData), onChunk);
  }
}

/* ---------- 6. 统一 AI 问答入口 askAI(question, contextData, contextType)
   ------------------------------------------------------------
   · question    用户搜索词/提问
   · contextData 当前“板块内”数据（只传本页数据，实现板块隔离）：
                   forum  → 帖子数组 [{content, author, time, likes}]
                   search → 通知数组 [{title, org, date, body, views}]
                   vote   → 投票数组 [{question, options:[{text}], status, ...}]
                   circle → { plaza:[广场动态], circles:[圈子] }
   · contextType 'forum' | 'search' | 'vote' | 'circle'（缺省按 forum 处理）
   失败（断网/报错/超时）自动降级到本地权重模板，绝不白屏。
   ============================================================ */

// 板块未命中统一话术（真实 AI 与本地兜底共用，四个页面文案一致）
const AI_NO_RESULT_MSG = '当前板块未找到相关信息，建议换个词试试，或者去其他板块看看哦~';

// 各板块差异化角色设定
const AI_ROLE_PROMPTS = {
  forum: '你是一个校园论坛的AI助手。请根据提供的帖子数据，总结并回答用户的问题，给出学长学姐般的建议。',
  search: '你是一个校园官方信息库的AI助手。请根据提供的信息库通知，提炼核心要点，给用户提供准确的政策解答。',
  vote: '你是一个校园投票AI助手。请根据提供的投票议题，总结大家关注的热点，给出民主决策的参考。',
  circle: '你是一个校园社团AI助手。请根据提供的广场动态和圈子信息，总结社团活动热点，推荐感兴趣的圈子。'
};

// 判断某板块上下文是否为空
function isContextEmpty(type, data) {
  if (type === 'circle') {
    return !data || !(data.plaza || []).length && !(data.circles || []).length;
  }
  return !data || (Array.isArray(data) && data.length === 0);
}

// 把板块数据序列化为给大模型的文本（只包含当前板块数据）
function serializeContext(type, data) {
  const list = (Array.isArray(data) ? data : []).slice(0, 5);
  if (type === 'forum') {
    return list.map(p =>
      `【帖子】${p.content}\n【作者】${p.author || '匿名'}${p.time ? `\n【时间】${p.time}` : ''}`
    ).join('\n\n');
  }
  if (type === 'search') {
    return list.map(n =>
      `【通知标题】${n.title}\n【发布单位】${n.org || ''}\n【日期】${n.date || ''}\n【正文】${String(n.body || '').replace(/\{url\}/g, '').slice(0, 300)}`
    ).join('\n\n');
  }
  if (type === 'vote') {
    // 盲投安全：进行中的投票只给选项名与总参与人数，绝不暴露单选项票数
    return list.map(p => {
      const opts = (p.options || []).map(o => o.text).join(' / ');
      const total = pollTotalVotes(p);
      const tail = p.status === 'finished'
        ? `\n【总票数】${total}`
        : `\n【参与人数】${total}（进行中盲投，不展示各选项票数）`;
      return `【投票议题】${p.question}\n【选项】${opts}${tail}`;
    }).join('\n\n');
  }
  if (type === 'circle') {
    const p = (data.plaza || []).slice(0, 4).map(x =>
      `【广场动态】${x.club || ''} ${x.title}\n【内容】${x.detail || ''}`
    ).join('\n\n');
    const c = (data.circles || []).slice(0, 6).map(x =>
      `【圈子】${x.name}（${x.members || 0}人）：${x.desc || ''}`
    ).join('\n');
    return [p, c].filter(Boolean).join('\n\n');
  }
  return '';
}

/* ---------- 本地降级模板：信息库（按浏览量取权重） ---------- */
const NOTICE_AI_OPENERS = ['为你找到', '搜索完成，共找到', '已帮你筛选出', 'AI 扫描完毕，匹配到'];
const NOTICE_AI_HOT = [
  '其中《{title}》（已有 {n} 人浏览）关注度最高，可能最切合你的需要。',
  '最受关注的是《{title}》，目前已有 {n} 人查看，推荐你优先阅读。',
  '《{title}》人气最旺，累计 {n} 次浏览，与你的查询最为相关。'
];
const NOTICE_AI_TAILS = ['', '详情可展开下方卡片查看全文。', '希望这些官方信息对你有帮助！'];

function generateLocalNoticeSummary(matched) {
  const list = matched || [];
  if (list.length === 0) return AI_NO_RESULT_MSG;
  const top = [...list].sort((a, b) => (b.views || 0) - (a.views || 0))[0];
  const hot = pickRandom(NOTICE_AI_HOT).replace('{title}', top.title).replace('{n}', top.views || 0);
  const tail = Math.random() < 0.6 ? pickRandom(NOTICE_AI_TAILS) : '';
  return `${pickRandom(NOTICE_AI_OPENERS)} ${list.length} 条相关校园信息。${hot}${tail}`;
}

/* ---------- 本地降级模板：投票（按参与人数取权重，盲投只提总人数） ---------- */
function generateLocalPollSummary(matched) {
  const list = matched || [];
  if (list.length === 0) return AI_NO_RESULT_MSG;
  const top = [...list].sort((a, b) => pollTotalVotes(b) - pollTotalVotes(a))[0];
  const hot = pickRandom(POLL_AI_HOT)
    .replace('{q}', simplifyTitle(top.question))
    .replace('{n}', pollTotalVotes(top));
  const tail = Math.random() < 0.6 ? pickRandom(POLL_AI_TAILS) : '';
  return `${pickRandom(POLL_AI_OPENERS)} ${list.length} 个相关投票。${hot}${tail}`;
}

/* ---------- 本地降级模板：圈子（广场按时间，圈子按成员数） ---------- */
function generateLocalCircleSummary(question, data) {
  const plaza = (data && data.plaza) || [];
  const circles = (data && data.circles) || [];
  if (plaza.length === 0 && circles.length === 0) return AI_NO_RESULT_MSG;
  let s = `【AI智能总结】共找到 ${plaza.length} 条广场动态、${circles.length} 个相关圈子。`;
  const topPost = [...plaza].sort((a, b) => (b.time || 0) - (a.time || 0))[0];
  const topCircle = [...circles].sort((a, b) => (b.members || 0) - (a.members || 0))[0];
  if (topPost) s += `最新的是${topPost.club || '社团'}发布的《${simplifyTitle(topPost.title)}》`;
  if (topCircle) s += `${topPost ? '；' : ''}推荐关注《${topCircle.name}》（已有 ${topCircle.members} 名成员）`;
  s += '，感兴趣就加入圈子一起玩吧~';
  return s;
}

// 按板块分发到对应的本地权重模板
function localFallbackAnswer(type, question, data) {
  if (type === 'search') return generateLocalNoticeSummary(data);
  if (type === 'vote') return generateLocalPollSummary(data);
  if (type === 'circle') return generateLocalCircleSummary(question, data);
  return generateLocalAISummary(question, data);   // forum
}

async function askAI(question, contextData, contextType) {
  const type = AI_ROLE_PROMPTS[contextType] ? contextType : 'forum';

  // 板块内没有任何命中：直接返回统一话术（不调用外部接口）
  if (isContextEmpty(type, contextData)) return AI_NO_RESULT_MSG;

  if (!USE_REAL_API) {
    await new Promise(r => setTimeout(r, 1200));   // 配合页面“AI正在阅读...”动画
    return localFallbackAnswer(type, question, contextData);
  }

  // ---- 真实 API 模式：注入板块角色 + 只携带当前板块数据 ----
  const systemPrompt = `${AI_ROLE_PROMPTS[type]}
回答控制在100字以内，不要 markdown，纯文本即可。
若提供的数据与用户问题完全无关，请直接回复：${AI_NO_RESULT_MSG}`;

  const userPrompt = `用户提问：${question}

当前板块数据：
${serializeContext(type, contextData)}`;

  try {
    // 8 秒超时保护：断网/挂起时也能及时走本地兜底
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY
      },
      signal: controller ? controller.signal : undefined,
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });
    if (timer) clearTimeout(timer);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error('AI返回内容为空');
    return answer;

  } catch (err) {
    // CORS / 断网 / 超时 / API报错 → 降级到本地权重模板，绝不白屏
    console.warn('[ai-core] AI请求失败，启用本地降级模板：', err);
    return localFallbackAnswer(type, question, contextData);
  }
}

/* ---------- 通用智谱 API 对话调用（供“AI智能拟题”等需要自定义 system prompt 的场景） ----------
   与 askAI 的区别：不注入板块角色、不做本地模板兜底。
   成功 → 返回模型输出文本（已 trim）；
   失败（断网/超时/HTTP 错误/空响应）→ 直接 throw，由调用方自行提示。 */
async function callAIAPI(messages, timeoutMs = 8000) {
  if (!Array.isArray(messages) || messages.length === 0) throw new Error('messages 不能为空');

  const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY
      },
      signal: controller ? controller.signal : undefined,
      body: JSON.stringify({ model: MODEL_NAME, messages })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('AI返回内容为空');
    return content;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ============================================================
   用户等级与经验激励引擎（所有页面复用，状态存 localStorage）
   升级所需经验等比翻倍：100, 200, 400, 800, 1600
   累计阈值：Lv1=0  Lv2=100  Lv3=300  Lv4=700  Lv5=1500  Lv6=3100
   ============================================================ */
const LEVELS = [
  { lv: 1, name: '小白',     color: '#FFFFFF' },
  { lv: 2, name: '萌新',     color: '#4CAF50' },
  { lv: 3, name: '初出茅庐', color: '#2196F3' },
  { lv: 4, name: '资深',     color: '#9C27B0' },
  { lv: 5, name: '老油条',   color: '#FF9800' },
  { lv: 6, name: '百事通',   color: '#F44336' }
];
// 达到该累计经验即进入对应等级（唯一数据源，页面不要自己再算区间）
const LEVEL_THRESHOLDS = [0, 100, 300, 700, 1500, 3100];

function getExperience() {
  return Number(localStorage.getItem('userExp')) || 0;
}
function setExperience(v) {
  localStorage.setItem('userExp', Math.max(0, Math.floor(v)));
}

// 由经验值计算等级、称号颜色、当前级进度
function getLevelInfo(exp) {
  exp = Math.max(0, Math.floor(exp || 0));
  let idx = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (exp >= LEVEL_THRESHOLDS[i]) idx = i;
  }
  const start = LEVEL_THRESHOLDS[idx];
  const next = LEVEL_THRESHOLDS[idx + 1];
  const info = Object.assign({}, LEVELS[idx], {
    exp,
    levelStart: start,
    nextExp: next === undefined ? null : next,
    intoLevel: exp - start
  });
  if (next === undefined) {
    info.need = 0;
    info.percent = 100;   // 满级
  } else {
    info.need = next - start;
    info.percent = Math.min(100, (exp - start) / (next - start) * 100);
  }
  return info;
}

function levelToday() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

/**
 * 获取经验（纯前端，localStorage 持久化）
 * @param {string} type  dailyLogin | reply | viral
 * @param {object} payload  viral: { postId, likes, comments }
 * @returns {{gained:number, leveledUp:boolean, level:object, beforeLv:number}}
 */
function addExperience(type, payload) {
  let gained = 0;

  if (type === 'dailyLogin') {
    // 每日登录 +2（每天只结算一次）
    if (localStorage.getItem('loginDate') !== levelToday()) {
      gained = 2;
      localStorage.setItem('loginDate', levelToday());
    }

  } else if (type === 'reply') {
    // 回复他人：每天前 3 次各 +1
    const sameDay = localStorage.getItem('replyDate') === levelToday();
    const cnt = sameDay ? (Number(localStorage.getItem('replyCount')) || 0) : 0;
    if (cnt < 3) {
      gained = 1;
      localStorage.setItem('replyDate', levelToday());
      localStorage.setItem('replyCount', String(cnt + 1));
    }

  } else if (type === 'viral') {
    // 爆款：点赞 > 1000 且评论数 ≥ 点赞数的 1%，
    // 每超出 10 个点赞 +1；按帖子记录已发档位，跨档只补差额（无上限、不重复发）
    const likes = Number(payload && payload.likes) || 0;
    const comments = Number(payload && payload.comments) || 0;
    if (likes > 1000 && comments >= likes * 0.01) {
      const tier = Math.floor((likes - 1000) / 10);
      let map = {};
      try { map = JSON.parse(localStorage.getItem('viralTiers')) || {}; } catch (e) { map = {}; }
      const key = String((payload && payload.postId) || 'default');
      const prev = map[key] || 0;
      if (tier > prev) {
        gained = tier - prev;
        map[key] = tier;
        localStorage.setItem('viralTiers', JSON.stringify(map));
      }
    }
  }

  const beforeLv = getLevelInfo(getExperience()).lv;
  if (gained > 0) setExperience(getExperience() + gained);
  const level = getLevelInfo(getExperience());
  return { gained, leveledUp: level.lv > beforeLv, beforeLv, level };
}

/* ===================== 投票页 AI 总结（本地多变文案） =====================
 * 复用 askAI 的“本地模板 + 随机句式”思路。
 * 安全约定：进行中的投票为盲投，只提及总参与人数，绝不暴露单个选项票数。
 */
const POLL_AI_OPENERS = [
  '为你找到',
  '搜索完成，共找到',
  '已帮你筛选出',
  'AI 扫描完毕，匹配到'
];
const POLL_AI_HOT = [
  '其中《{q}》（已有 {n} 人参与）热度最高，可能最切合你的需要。',
  '参与度最高的是《{q}》，目前已有 {n} 人投出了自己的一票，值得优先看看。',
  '其中《{q}》人气最旺，{n} 位同学已经参与，推荐你重点关注。',
  '《{q}》吸引了 {n} 人参与，是这批投票里当之无愧的焦点。'
];
const POLL_AI_TAILS = [
  '',
  '感兴趣就尽快参与吧～',
  '更多结果可以在下方卡片中查看。',
  '希望这些结果对你有帮助！'
];

// matchedPolls: 已按关键词筛好的投票数组（不区分置顶，按匹配结果传入）
// 兼容旧调用：内部统一走 askAI 的 vote 板块本地模板
async function askAIForPolls(keyword, matchedPolls) {
  await new Promise(r => setTimeout(r, 1200));   // 配合“AI正在分析”动画
  return generateLocalPollSummary(matchedPolls);
}

// 投票总参与人数（ai-core 内独立实现，避免依赖页面函数）
function pollTotalVotes(poll) {
  return (poll.options || []).reduce((s, o) => s + (Number(o.votes) || 0), 0);
}
