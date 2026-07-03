/**
 * 从 LLM 混合文本中提取 JSON 对象/数组。
 *
 * 背景：Dify 工作流的 outputs.text 常把 LLM 的推理过程（CoT）与最终 JSON
 * 拼接在同一个字符串里，且可能包裹 markdown 代码块或 <think> 标签。
 * 裸 JSON.parse 会在首个非 JSON 字符处失败，导致真实数据被丢弃。
 *
 * 提取策略（按优先级）：
 *  1. 裸 JSON.parse（fast path，纯 JSON 文本直接命中）
 *  2. 剥离 <think>...</think> 后再 parse
 *  3. 剥离 ```json ... ``` 代码块后取其内容 parse
 *  4. 扫描首个 '{' 或 '['，按括号配对截取子串后 parse（容忍后续尾随文本）
 *
 * @param {string} text - LLM 原始输出
 * @returns {object|array|null} 解析成功返回 JS 对象/数组；无法解析返回 null
 */
function extractJson(text) {
  if (!text || typeof text !== 'string') return null;

  const tryParse = (s) => {
    try {
      const v = JSON.parse(s);
      return typeof v === 'object' && v !== null ? v : null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(text.trim());
  if (direct) return direct;

  const noThink = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (noThink !== text.trim()) {
    const v = tryParse(noThink);
    if (v) return v;
  }

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    const v = tryParse(fenceMatch[1].trim());
    if (v) return v;
  }

  for (const open of ['{', '[']) {
    const start = text.indexOf(open);
    if (start === -1) continue;
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inStr = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          const candidate = text.substring(start, i + 1);
          const v = tryParse(candidate);
          if (v) return v;
          break;
        }
      }
    }
  }

  return null;
}

module.exports = { extractJson };
