const express = require('express');
const { getAdapter } = require('../db/database');
const sql = require('../db/sql');
const { success, error, AppError } = require('../utils/response');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { parseTags, serializeTags } = require('../utils/jsonFields');
const authMiddleware = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const { callWorkflowBlocking } = require('../services/difyService');
const { validateArticleGenerate } = require('../utils/validators');

const router = express.Router();

const recentGenerates = new Map();
const DEFAULT_CATEGORIES = [
  { label: '饮食指导', recommended: false, reason: '' },
  { label: '运动指南', recommended: false, reason: '' },
  { label: '生活习惯', recommended: false, reason: '' },
  { label: '糖尿病知识科普', recommended: false, reason: '' }
];

function buildMockArticle(category) {
  return {
    title: `${category}——糖尿病管理指南`,
    content: `# ${category}\n\n这是关于"${category}"的AI生成文章（Mock模式）。\n\n> 以上内容由AI自动生成，仅供参考。`,
    tags: [category],
    summary: `本文围绕"${category}"展开介绍。`,
    cover: null
  };
}

router.get('/collections', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const { page, pageSize, offset, limit } = parsePagination(req.query);

    const countRows = await adapter.query('SELECT COUNT(*) AS total FROM article_collections WHERE user_id = ?', [req.user.user_id]);
    const total = countRows[0].total;

    const rows = await adapter.query(
      'SELECT a.id, a.title, a.cover, a.author, a.category, a.tags, a.summary, a.views, a.created_at, ac.id AS collect_id FROM article_collections ac JOIN articles a ON ac.article_id = a.id WHERE ac.user_id = ? ORDER BY ac.created_at DESC LIMIT ? OFFSET ?',
      [req.user.user_id, limit, offset]
    );
    rows.forEach(row => { row.tags = parseTags(row.tags); });

    const pagination = buildPagination(page, pageSize, total);
    res.status(200).json({ success: true, message: '查询成功', data: rows, pagination });
  } catch (e) {
    next(e);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const { page, pageSize, offset, limit } = parsePagination(req.query);
    const params = [];
    let countSQL = 'SELECT COUNT(*) AS total FROM articles WHERE user_id IS NULL';
    let dataSQL = 'SELECT id, title, cover, author, category, tags, summary, views, created_at FROM articles WHERE user_id IS NULL';

    if (req.query.category) {
      countSQL += ' AND category = ?';
      dataSQL += ' AND category = ?';
      params.push(req.query.category);
    }

    const countRows = await adapter.query(countSQL, params);
    const total = countRows[0].total;

    dataSQL += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const rows = await adapter.query(dataSQL, [...params, limit, offset]);
    rows.forEach(row => { row.tags = parseTags(row.tags); });

    const pagination = buildPagination(page, pageSize, total);
    res.status(200).json({ success: true, message: '查询成功', data: rows, pagination });
  } catch (e) {
    next(e);
  }
});

router.post('/generate', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();

    const lastTime = recentGenerates.get(req.user.user_id);
    if (lastTime && Date.now() - lastTime < 30000) {
      return error(res, 'CONFLICT', '请求过于频繁，请30秒后再试', 409);
    }
    recentGenerates.set(req.user.user_id, Date.now());

    const validationError = validateArticleGenerate(req.body);
    if (validationError) {
      return error(res, 'VALIDATION_ERROR', validationError, 422);
    }

    if (!req.body.category) {
      const riskRow = await adapter.queryOne(
        'SELECT weight / ((height / 100.0) * (height / 100.0)) AS bmi FROM user_risk_info WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
        [req.user.user_id]
      );
      const bmi = riskRow ? riskRow.bmi : null;

      const categories = DEFAULT_CATEGORIES.map(c => ({ ...c }));
      if (bmi !== null && bmi > 24) {
        categories[0].recommended = true;
        categories[0].reason = '基于您的BMI，饮食管理是血糖控制的关键';
      }
      if (bmi !== null && bmi > 28) {
        categories[1].recommended = true;
        categories[1].reason = '基于您的BMI，适量运动有助于改善胰岛素敏感性';
      }
      return success(res, { stage: 'category_selection', categories }, '分类推荐', 200);
    }

    const category = req.body.category.trim();
    let articleData;

    const difyBase = process.env.DIFY_API_BASE;
    const difyKey = process.env.DIFY_ARTICLE_WORKFLOW_KEY;

    if (!difyBase || !difyKey) {
      articleData = buildMockArticle(category);
    } else {
      try {
        const result = await callWorkflowBlocking(difyKey, { category }, 'article');
        const outputsText = result && result.data && result.data.outputs && result.data.outputs.text;
        if (outputsText) {
          let parsed;
          try {
            parsed = JSON.parse(outputsText);
          } catch (e) {
            parsed = null;
          }
          if (parsed && parsed.title && typeof parsed.title === 'string') {
            articleData = {
              title: parsed.title || `${category}——糖尿病管理指南`,
              content: parsed.content || buildMockArticle(category).content,
              tags: Array.isArray(parsed.tags) ? parsed.tags : [category],
              summary: parsed.summary || buildMockArticle(category).summary,
              cover: parsed.cover || null
            };
          } else {
            articleData = buildMockArticle(category);
          }
        } else {
          articleData = buildMockArticle(category);
        }
      } catch (err) {
        console.error('[articles/generate] Dify error:', err.message);
        articleData = buildMockArticle(category);
      }
    }

    const result = await adapter.execute(
      `INSERT INTO articles (user_id, title, cover, author, content, category, tags, summary, created_at) VALUES (?, ?, ?, 'AI健康助手', ?, ?, ?, ?, ${sql.now()})`,
      [req.user.user_id, articleData.title, articleData.cover, articleData.content, category, serializeTags(articleData.tags), articleData.summary]
    );

    const newArticle = await adapter.queryOne(
      'SELECT id, title, cover, author, content, category, tags, summary, views, created_at FROM articles WHERE id = ?',
      [result.lastInsertId]
    );
    newArticle.tags = parseTags(newArticle.tags);
    newArticle.is_collected = false;

    success(res, newArticle, '文章生成成功', 200);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const row = await adapter.queryOne(
      'SELECT id, title, cover, author, content, category, tags, summary, views, created_at FROM articles WHERE id = ?',
      [req.params.id]
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', '文章不存在');
    row.tags = parseTags(row.tags);

    if (req.user) {
      const exists = await adapter.queryOne('SELECT 1 FROM article_collections WHERE user_id = ? AND article_id = ?', [req.user.user_id, req.params.id]);
      row.is_collected = !!exists;
    } else {
      row.is_collected = false;
    }
    success(res, row, '查询成功', 200);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/collect', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const article = await adapter.queryOne('SELECT id FROM articles WHERE id = ?', [req.params.id]);
    if (!article) throw new AppError(404, 'NOT_FOUND', '文章不存在');

    const existing = await adapter.queryOne('SELECT id FROM article_collections WHERE user_id = ? AND article_id = ?', [req.user.user_id, req.params.id]);
    if (existing) return success(res, null, '文章已收藏', 200);

    await adapter.execute('INSERT INTO article_collections (user_id, article_id) VALUES (?, ?)', [req.user.user_id, req.params.id]);
    success(res, null, '收藏成功', 200);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id/collect', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const existing = await adapter.queryOne('SELECT id FROM article_collections WHERE user_id = ? AND article_id = ?', [req.user.user_id, req.params.id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '未收藏该文章');

    await adapter.execute('DELETE FROM article_collections WHERE user_id = ? AND article_id = ?', [req.user.user_id, req.params.id]);
    success(res, null, '已取消收藏', 200);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
