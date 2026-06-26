function parseTags(tagsText) {
  if (!tagsText) return [];
  try {
    const result = JSON.parse(tagsText);
    if (Array.isArray(result)) return result;
    return [];
  } catch {
    return [];
  }
}

function serializeTags(tagsArray) {
  return JSON.stringify(tagsArray);
}

module.exports = { parseTags, serializeTags };
