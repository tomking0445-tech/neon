const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../auth');

// 콘텐츠에 속하지 않는, postId만으로 다루는 라우트: /api/posts/*
const router = express.Router();

router.delete('/:postId', requireAuth, async (req, res) => {
  const post = await prisma.post.findUnique({ where: { id: req.params.postId } });
  if (!post) return res.status(404).json({ error: 'NOT_FOUND' });
  if (post.userId !== req.user.id) return res.status(403).json({ error: 'FORBIDDEN' });

  await prisma.post.delete({ where: { id: post.id } });
  res.status(204).end();
});

router.post('/:postId/comments', requireAuth, async (req, res) => {
  const { text } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: '댓글 내용을 입력하세요.' });
  }

  const post = await prisma.post.findUnique({ where: { id: req.params.postId } });
  if (!post) return res.status(404).json({ error: 'NOT_FOUND' });

  const comment = await prisma.comment.create({
    data: { postId: post.id, userId: req.user.id, text: String(text).slice(0, 500) }
  });

  res.status(201).json({ item: comment });
});

module.exports = router;
