const { AppError } = require('../middleware/errorHandler');

function parseDateRange(query) {
  let startDate = null;
  let endDate = null;

  if (query.startDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(query.startDate)) {
      throw new AppError(422, 'VALIDATION_ERROR', '日期格式必须为 YYYY-MM-DD');
    }
    startDate = query.startDate;
  }

  if (query.endDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(query.endDate)) {
      throw new AppError(422, 'VALIDATION_ERROR', '日期格式必须为 YYYY-MM-DD');
    }
    endDate = query.endDate + 'T23:59:59';
  }

  if (startDate && endDate && startDate > endDate.replace('T23:59:59', '')) {
    throw new AppError(422, 'VALIDATION_ERROR', '开始日期不能晚于结束日期');
  }

  return { startDate, endDate };
}

module.exports = { parseDateRange };
