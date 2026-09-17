const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../auth');

// /api/comments/:commentId
const router = express.Router();

router.delete('/:commentId', requireAuth, async (req, res) => {
  const comment = await prisma.comment.findUnique({ where: { id: req.params.commentId } });
  if (!comment) return res.status(404).json({ error: 'NOT_FOUND' });
  if (comment.userId !== req.user.id) return res.status(403).json({ error: 'FORBIDDEN' });

  await prisma.comment.delete({ where: { id: comment.id } });
  res.status(204).end();
});

module.exports = router;
