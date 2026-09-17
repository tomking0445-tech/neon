const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../auth');

// GET/POST /api/contents/:contentId/posts (mergeParams로 contentId를 받습니다)
const router = express.Router({ mergeParams: true });
const BOARDS = ['free', 'guide', 'bug'];

router.get('/', async (req, res) => {
  const { board } = req.query;
  const where = { contentId: req.params.contentId };
  if (board && BOARDS.includes(board)) where.board = board;

  const posts = await prisma.post.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, name: true } },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { id: true, name: true } } }
      }
    }
  });

  res.json({
    items: posts.map(p => ({
      id: p.id,
      board: p.board,
      title: p.title,
      body: p.body,
      createdAt: p.createdAt,
      userId: p.user.id,
      userName: p.user.name,
      comments: p.comments.map(c => ({
        id: c.id,
        text: c.text,
        createdAt: c.createdAt,
        userId: c.user.id,
        userName: c.user.name
      }))
    }))
  });
});

// 커뮤니티 게시판은 웹게임 카테고리에만 허용합니다(프론트 정책과 동일하게 서버에서도 강제).
router.post('/', requireAuth, async (req, res) => {
  const { board, title, body } = req.body || {};
  if (!BOARDS.includes(board)) {
    return res.status(400).json({ error: 'INVALID_BOARD', message: '게시판 종류가 올바르지 않습니다.' });
  }
  if (!title || !String(title).trim() || !body || !String(body).trim()) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: '제목과 내용을 입력하세요.' });
  }

  const content = await prisma.content.findUnique({ where: { id: req.params.contentId } });
  if (!content) return res.status(404).json({ error: 'NOT_FOUND' });
  if (content.category !== 'webgame') {
    return res.status(403).json({ error: 'NOT_A_GAME', message: '커뮤니티 게시판은 웹게임 콘텐츠에만 제공됩니다.' });
  }

  const post = await prisma.post.create({
    data: {
      contentId: content.id,
      userId: req.user.id,
      board,
      title: String(title).slice(0, 80),
      body: String(body).slice(0, 4000)
    }
  });

  res.status(201).json({ item: post });
});

module.exports = router;
