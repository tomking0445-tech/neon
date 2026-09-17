const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../auth');

// mergeParams: true 로 부모 라우터(/api/contents/:contentId)의 파라미터를 그대로 받습니다.
const router = express.Router({ mergeParams: true });

router.get('/', async (req, res) => {
  const reviews = await prisma.review.findMany({
    where: { contentId: req.params.contentId },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { id: true, name: true } } }
  });

  res.json({
    items: reviews.map(r => ({
      id: r.id,
      rating: r.rating,
      text: r.text,
      createdAt: r.createdAt,
      userId: r.user.id,
      userName: r.user.name
    }))
  });
});

// 1인 1리뷰: 이미 작성했다면 upsert로 덮어씁니다.
router.post('/', requireAuth, async (req, res) => {
  const { rating, text } = req.body || {};
  const ratingNumber = Number(rating);
  if (!Number.isInteger(ratingNumber) || ratingNumber < 1 || ratingNumber > 5) {
    return res.status(400).json({ error: 'INVALID_RATING', message: '별점은 1~5 사이의 정수여야 합니다.' });
  }
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'INVALID_TEXT', message: '리뷰 내용을 입력하세요.' });
  }

  const content = await prisma.content.findUnique({ where: { id: req.params.contentId } });
  if (!content) return res.status(404).json({ error: 'NOT_FOUND' });

  const review = await prisma.review.upsert({
    where: { contentId_userId: { contentId: content.id, userId: req.user.id } },
    update: { rating: ratingNumber, text: String(text).slice(0, 2000) },
    create: { contentId: content.id, userId: req.user.id, rating: ratingNumber, text: String(text).slice(0, 2000) }
  });

  res.status(201).json({ item: review });
});

router.delete('/:reviewId', requireAuth, async (req, res) => {
  const review = await prisma.review.findUnique({ where: { id: req.params.reviewId } });
  if (!review) return res.status(404).json({ error: 'NOT_FOUND' });
  if (review.userId !== req.user.id) return res.status(403).json({ error: 'FORBIDDEN' });

  await prisma.review.delete({ where: { id: review.id } });
  res.status(204).end();
});

module.exports = router;
