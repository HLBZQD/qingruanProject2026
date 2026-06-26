const { AppError } = require('../middleware/errorHandler');

async function parsePlanOutput(outputsText, difyApiKey, callWorkflowFn, originalInputs) {
  let items = null;
  let parseMethod = 'json';

  try {
    const parsed = JSON.parse(outputsText);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const valid = parsed.every(item =>
        item.plan_type && item.title && item.content
      );
      if (valid) {
        items = parsed.map(item => ({
          plan_type: item.plan_type || '',
          order_num: item.order_num || 0,
          time_desc: item.time_desc || '',
          title: item.title || '',
          content: item.content || ''
        }));
        parseMethod = 'json';
        return { items, parseMethod };
      }
    }
  } catch (e) {
  }

  items = parsePlanOutputRegex(outputsText);
  if (items && items.length > 0) {
    parseMethod = 'regex';
    return { items, parseMethod };
  }

  try {
    const retryInputs = {
      ...originalInputs,
      __retry_parse: outputsText,
      __retry_mode: true
    };
    const retryResponse = await callWorkflowFn(difyApiKey, retryInputs);
    const retryText = retryResponse.data.outputs.text;
    const retryParsed = JSON.parse(retryText);
    if (Array.isArray(retryParsed) && retryParsed.length > 0) {
      items = retryParsed.map(item => ({
        plan_type: item.plan_type || '',
        order_num: item.order_num || 0,
        time_desc: item.time_desc || '',
        title: item.title || '',
        content: item.content || ''
      }));
      parseMethod = 'llm_retry';
      return { items, parseMethod };
    }
  } catch (e) {
  }

  throw new AppError(502, 'PLAN_PARSE_ERROR', '方案生成成功但解析失败，请重试');
}

function parsePlanOutputRegex(text) {
  const items = [];

  const objPattern = /\{[^}]*\}/g;
  let objMatch;
  while ((objMatch = objPattern.exec(text)) !== null) {
    const objStr = objMatch[0];
    const planType = extractField(objStr, /"plan_type"\s*:\s*"(diet|exercise|other)"/);
    const orderNum = extractField(objStr, /"order_num"\s*:\s*(\d+)/);
    const timeDesc = extractField(objStr, /"time_desc"\s*:\s*"([^"]*)"/);
    const title = extractField(objStr, /"title"\s*:\s*"([^"]*)"/);
    const content = extractField(objStr, /"content"\s*:\s*"([^"]*)"/);

    if (planType && orderNum !== null && title) {
      items.push({
        plan_type: planType,
        order_num: Number(orderNum),
        time_desc: timeDesc || '',
        title: title,
        content: content || ''
      });
    }
  }

  return items.length > 0 ? items : null;
}

function extractField(text, regex) {
  const m = text.match(regex);
  return m ? m[1] : null;
}

module.exports = { parsePlanOutput };
