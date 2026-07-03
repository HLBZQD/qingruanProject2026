const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getAdapter } = require('../db/database');
const sql = require('../db/sql');
const { success, error, AppError } = require('../utils/response');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { parseTags, serializeTags } = require('../utils/jsonFields');
const authMiddleware = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const { callWorkflowBlocking } = require('../services/difyService');
const { validateArticleGenerate } = require('../utils/validators');
const { extractJson } = require('../utils/extractJson');

const router = express.Router();

// ===== 封面图上传配置 =====
const coverUploadDir = path.join(__dirname, '..', '..', 'static', 'uploads', 'articles');
try {
  if (!fs.existsSync(coverUploadDir)) fs.mkdirSync(coverUploadDir, { recursive: true });
} catch (e) {
  console.warn('[articles] 创建封面上传目录失败:', e.message);
}

const coverStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, coverUploadDir),
  filename: (req, _file, cb) => {
    if (!req.user?.user_id) return cb(new Error('User not authenticated'));
    const ext = path.extname(_file.originalname).toLowerCase() || '.png';
    cb(null, `article_${req.params.id}_${Date.now()}${ext}`);
  }
});

const coverUpload = multer({
  storage: coverStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(415, 'UNSUPPORTED_FILE_TYPE', '仅支持 JPEG/PNG/WebP 格式'));
    }
  }
});

// 删除本地封面文件（仅当 cover 指向本地上传目录时，避免误删外链/默认图）
function removeLocalCover(coverPath) {
  if (!coverPath || !coverPath.startsWith('/static/uploads/articles/')) return;
  try {
    const abs = path.join(__dirname, '..', '..', coverPath);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch (e) {
    console.warn('[articles] 删除旧封面文件失败:', e.message);
  }
}

const recentGenerates = new Map();
const DEFAULT_CATEGORIES = [
  { label: '饮食指导', recommended: false, reason: '' },
  { label: '运动指南', recommended: false, reason: '' },
  { label: '生活习惯', recommended: false, reason: '' },
  { label: '知识科普', recommended: false, reason: '' }
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

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const { page, pageSize, offset, limit } = parsePagination(req.query);
    const params = [];
    const userId = req.user ? req.user.user_id : null;
    const onlyMine = req.query.mine === 'true' && userId;

    let countSQL;
    let dataSQL;
    const baseCols = 'id, title, cover, author, category, tags, summary, views, created_at';
    if (onlyMine) {
      countSQL = 'SELECT COUNT(*) AS total FROM articles WHERE user_id = ?';
      dataSQL = `SELECT ${baseCols} FROM articles WHERE user_id = ?`;
      params.push(userId);
    } else if (userId) {
      countSQL = 'SELECT COUNT(*) AS total FROM articles WHERE (user_id IS NULL OR user_id = ?)';
      dataSQL = `SELECT ${baseCols} FROM articles WHERE (user_id IS NULL OR user_id = ?)`;
      params.push(userId);
    } else {
      countSQL = 'SELECT COUNT(*) AS total FROM articles WHERE user_id IS NULL';
      dataSQL = `SELECT ${baseCols} FROM articles WHERE user_id IS NULL`;
    }

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

    const lastTime = recentGenerates.get(req.user.user_id);
    if (lastTime && Date.now() - lastTime < 30000) {
      return error(res, 'CONFLICT', '请求过于频繁，请30秒后再试', 409);
    }
    recentGenerates.set(req.user.user_id, Date.now());

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
          const parsed = extractJson(outputsText);
          if (parsed && parsed.title && typeof parsed.title === 'string') {
            articleData = {
              title: parsed.title || `${category}——糖尿病管理指南`,
              content: parsed.content || buildMockArticle(category).content,
              tags: Array.isArray(parsed.tags) ? parsed.tags : [category],
              summary: parsed.summary || buildMockArticle(category).summary,
              cover: parsed.cover || null
            };
          } else {
            console.warn('[articles/generate] 无法从 Dify 输出中提取有效文章 JSON，回退 Mock');
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
      'SELECT id, user_id, title, cover, author, content, category, tags, summary, views, created_at FROM articles WHERE id = ?',
      [req.params.id]
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', '文章不存在');
    row.tags = parseTags(row.tags);

    await adapter.execute(
      'UPDATE articles SET views = views + 1 WHERE id = ?',
      [req.params.id]
    );
    row.views += 1;

    if (req.user) {
      const exists = await adapter.queryOne('SELECT 1 FROM article_collections WHERE user_id = ? AND article_id = ?', [req.user.user_id, req.params.id]);
      row.is_collected = !!exists;
    } else {
      row.is_collected = false;
    }
    row.is_owner = !!(req.user && (req.user.role === 'admin' || (row.user_id != null && row.user_id === req.user.user_id)));
    delete row.user_id;
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

// ===== 替换封面（仅作者本人）=====
router.put('/:id/cover', authMiddleware, (req, res, next) => {
  coverUpload.single('cover')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return error(res, 'FILE_TOO_LARGE', '封面文件不能超过 2MB', 413);
      }
      return error(res, 'BAD_REQUEST', err.message, 400);
    }
    if (err instanceof AppError) {
      return error(res, err.code, err.message, err.statusCode);
    }
    if (err) {
      return error(res, 'INTERNAL_ERROR', err.message, 500);
    }

    (async () => {
      try {
        const adapter = getAdapter();
        if (!req.file) {
          return error(res, 'VALIDATION_ERROR', '请选择要上传的封面图片', 422);
        }

        const article = await adapter.queryOne('SELECT user_id, cover FROM articles WHERE id = ?', [req.params.id]);
        if (!article) throw new AppError(404, 'NOT_FOUND', '文章不存在');
        if (req.user.role !== 'admin' && (article.user_id == null || article.user_id !== req.user.user_id)) {
          removeLocalCover(`/static/uploads/articles/${req.file.filename}`);
          throw new AppError(403, 'FORBIDDEN', '无权修改他人文章的封面');
        }

        const newCover = `/static/uploads/articles/${req.file.filename}`;
        await adapter.execute('UPDATE articles SET cover = ? WHERE id = ?', [newCover, req.params.id]);
        removeLocalCover(article.cover);

        success(res, { cover: newCover }, '封面更新成功', 200);
      } catch (e) {
        next(e);
      }
    })();
  });
});

// ===== 删除文章（作者本人或管理员）=====
router.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const article = await adapter.queryOne('SELECT user_id, cover FROM articles WHERE id = ?', [req.params.id]);
    if (!article) throw new AppError(404, 'NOT_FOUND', '文章不存在');
    if (req.user.role !== 'admin' && (article.user_id == null || article.user_id !== req.user.user_id)) {
      throw new AppError(403, 'FORBIDDEN', '无权删除他人文章');
    }

    await adapter.execute('DELETE FROM articles WHERE id = ?', [req.params.id]);
    removeLocalCover(article.cover);

    success(res, null, '文章已删除', 200);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
