function parsePagination(query) {
  let page = 1, pageSize = 20;
  if (query.page && Number(query.page) > 0 && !isNaN(Number(query.page))) {
    page = Number(query.page);
  }
  if (query.pageSize && Number(query.pageSize) > 0 && !isNaN(Number(query.pageSize))) {
    pageSize = Number(query.pageSize);
  }
  if (pageSize > 100) pageSize = 100;
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset, limit: pageSize };
}

function buildPagination(page, pageSize, total) {
  const totalPages = Math.ceil(total / pageSize);
  return { page, pageSize, total, totalPages };
}

module.exports = { parsePagination, buildPagination };
