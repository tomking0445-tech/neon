const express = require('express');
const prisma = require('../db');
const { requireAuth, optionalAuth } = require('../auth');
const { computeSplit, PAYMENT_METHODS } = require('../fee');

const router = express.Router();

const CATEGORIES = ['webgame', 'image', 'audio', 'asset'];

function summarize(content) {
  const count = content.reviews.length;
  const average = count ? content.reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;
  return { count, average: Math.round(average * 10) / 10 };
}

function serializeContent(content) {
  const { reviews, ...rest } = content;
  return { ...rest, rating: summarize(content) };
}

// 목록 조회 - 프론트의 demoContents를 그대로 대체합니다.
router.get('/', async (req, res) => {
  const { category, q, sort } = req.query;

  const where = { published: true };
  if (category && CATEGORIES.includes(category)) where.category = category;
  if (q) {
    where.OR = [
      { name: { contains: String(q), mode: 'insensitive' } },
      { tags: { has: String(q) } }
    ];
  }

  let orderBy = { createdAt: 'desc' };
  if (sort === 'price-asc') orderBy = { price: 'asc' };
  if (sort === 'price-desc') orderBy = { price: 'desc' };

  const contents = await prisma.content.findMany({
    where,
    orderBy,
    include: { creator: { select: { name: true } }, reviews: { select: { rating: true } } }
  });

  res.json({
    items: contents.map(c => serializeContent({
      ...c,
      creator: c.creator.name
    }))
  });
});

router.get('/:id', async (req, res) => {
  const content = await prisma.content.findUnique({
    where: { id: req.params.id },
    include: { creator: { select: { name: true } }, reviews: { select: { rating: true } } }
  });
  if (!content || !content.published) return res.status(404).json({ error: 'NOT_FOUND' });

  res.json({ item: serializeContent({ ...content, creator: content.creator.name }) });
});

// 크리에이터 업로드. 실제 파일 업로드(이미지/게임 빌드/오디오)는 별도 스토리지(S3, R2 등)
// 프리사인 URL 발급 API를 추가로 붙이고 여기서는 fileUrl/previewUrl만 저장하세요.
router.post('/', requireAuth, async (req, res) => {
  const { name, category, price, tags, art, initial, description, previewUrl, fileUrl } = req.body || {};

  if (!name || !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: '콘텐츠명과 유효한 카테고리가 필요합니다.' });
  }
  const priceNumber = Number(price);
  if (!Number.isSafeInteger(priceNumber) || priceNumber < 0) {
    return res.status(400).json({ error: 'INVALID_PRICE', message: '가격(원)은 0 이상의 정수여야 합니다.' });
  }

  const content = await prisma.content.create({
    data: {
      name: String(name).slice(0, 80),
      category,
      price: priceNumber,
      tags: Array.isArray(tags) ? tags.map(String).slice(0, 6) : [],
      art: String(art || 'orb'),
      initial: String(initial || req.user.name || 'N').slice(0, 1),
      description: description ? String(description).slice(0, 2000) : null,
      previewUrl: previewUrl ? String(previewUrl) : null,
      fileUrl: fileUrl ? String(fileUrl) : null,
      creatorId: req.user.id
    }
  });

  res.status(201).json({ item: { ...content, rating: { count: 0, average: 0 } } });
});

router.put('/:id', requireAuth, async (req, res) => {
  const content = await prisma.content.findUnique({ where: { id: req.params.id } });
  if (!content) return res.status(404).json({ error: 'NOT_FOUND' });
  if (content.creatorId !== req.user.id) return res.status(403).json({ error: 'FORBIDDEN' });

  const { name, price, tags, description, previewUrl, fileUrl, published } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = String(name).slice(0, 80);
  if (price !== undefined) {
    const priceNumber = Number(price);
    if (!Number.isSafeInteger(priceNumber) || priceNumber < 0) {
      return res.status(400).json({ error: 'INVALID_PRICE' });
    }
    data.price = priceNumber;
  }
  if (tags !== undefined) data.tags = Array.isArray(tags) ? tags.map(String).slice(0, 6) : [];
  if (description !== undefined) data.description = String(description).slice(0, 2000);
  if (previewUrl !== undefined) data.previewUrl = String(previewUrl);
  if (fileUrl !== undefined) data.fileUrl = String(fileUrl);
  if (published !== undefined) data.published = Boolean(published);

  const updated = await prisma.content.update({ where: { id: content.id }, data });
  res.json({ item: updated });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const content = await prisma.content.findUnique({ where: { id: req.params.id } });
  if (!content) return res.status(404).json({ error: 'NOT_FOUND' });
  if (content.creatorId !== req.user.id) return res.status(403).json({ error: 'FORBIDDEN' });

  await prisma.content.delete({ where: { id: content.id } });
  res.status(204).end();
});

// 구매/광고시청 데모 스텁 - 실제 PG/광고 SDK 연동 전까지는 기록만 남깁니다.
// TODO: PayPal / 한국 PG(토스페이먼츠 등) 연동 후, 결제 성공 웹훅에서 이 로직을 호출하도록 교체하세요.
router.post('/:id/purchase', requireAuth, async (req, res) => {
  const content = await prisma.content.findUnique({ where: { id: req.params.id } });
  if (!content) return res.status(404).json({ error: 'NOT_FOUND' });

  const { method } = req.body || {};
  const paymentMethod = PAYMENT_METHODS.includes(method) ? method : 'demo';
  const { feeAmount, netAmount } = computeSplit(content.price);

  const purchase = await prisma.purchase.create({
    data: {
      contentId: content.id,
      userId: req.user.id,
      amount: content.price,
      method: paymentMethod,
      feeAmount,
      netAmount
    }
  });
  res.status(201).json({ purchase, message: '데모 결제입니다. 실제 결제 연동 전에는 청구가 발생하지 않습니다.' });
});

module.exports = router;
