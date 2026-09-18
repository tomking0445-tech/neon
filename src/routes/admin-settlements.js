// 관리자 전용: 월별 정산 확정, 지급 처리, CSV 다운로드.
const express = require('express');
const prisma = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

function parsePeriod(query) {
  const now = new Date();
  const year = Number(query.year) || now.getUTCFullYear();
  const month = Number(query.month) || now.getUTCMonth() + 1;
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { year, month, start, end };
}

// 특정 연월의 미정산 구매 건을 크리에이터별로 미리 집계해서 보여줍니다(확정 전 미리보기, DB 변경 없음).
router.get('/settlements/preview', async (req, res) => {
  const period = parsePeriod(req.query);
  if (!period) return res.status(400).json({ error: 'INVALID_PERIOD', message: 'year, month를 올바르게 지정하세요.' });

  const purchases = await prisma.purchase.findMany({
    where: { settled: false, createdAt: { gte: period.start, lt: period.end } },
    include: { content: { include: { creator: { select: { id: true, name: true, email: true } } } } }
  });

  const byCreator = new Map();
  for (const purchase of purchases) {
    const creator = purchase.content.creator;
    const entry = byCreator.get(creator.id) || {
      creatorId: creator.id, creatorName: creator.name, creatorEmail: creator.email,
      grossAmount: 0, feeAmount: 0, netAmount: 0, itemCount: 0
    };
    entry.grossAmount += purchase.amount;
    entry.feeAmount += purchase.feeAmount;
    entry.netAmount += purchase.netAmount;
    entry.itemCount += 1;
    byCreator.set(creator.id, entry);
  }

  res.json({ year: period.year, month: period.month, items: Array.from(byCreator.values()) });
});

// 미리보기 내용을 실제로 확정합니다: 크리에이터별 Settlement 레코드를 만들고(이미 있으면 그대로 두고)
// 대상 구매 건들을 그 Settlement에 묶어 settled=true로 표시합니다. 같은 연월을 다시 실행해도
// 이미 정산된 건은 건드리지 않으므로 안전하게 재실행할 수 있습니다.
router.post('/settlements/generate', async (req, res) => {
  const period = parsePeriod(req.body || {});
  if (!period) return res.status(400).json({ error: 'INVALID_PERIOD', message: 'year, month를 올바르게 지정하세요.' });

  const purchases = await prisma.purchase.findMany({
    where: { settled: false, createdAt: { gte: period.start, lt: period.end } },
    include: { content: { select: { creatorId: true } } }
  });

  if (!purchases.length) {
    return res.json({ year: period.year, month: period.month, created: [], message: '해당 연월에 새로 정산할 미확정 구매 건이 없어요.' });
  }

  const byCreator = new Map();
  for (const purchase of purchases) {
    const creatorId = purchase.content.creatorId;
    const list = byCreator.get(creatorId) || [];
    list.push(purchase);
    byCreator.set(creatorId, list);
  }

  const results = [];
  for (const [creatorId, list] of byCreator.entries()) {
    const grossAmount = list.reduce((sum, p) => sum + p.amount, 0);
    const feeAmount = list.reduce((sum, p) => sum + p.feeAmount, 0);
    const netAmount = list.reduce((sum, p) => sum + p.netAmount, 0);

    const settlement = await prisma.$transaction(async tx => {
      const created = await tx.settlement.upsert({
        where: { creatorId_periodYear_periodMonth: { creatorId, periodYear: period.year, periodMonth: period.month } },
        update: {
          grossAmount: { increment: grossAmount },
          feeAmount: { increment: feeAmount },
          netAmount: { increment: netAmount },
          itemCount: { increment: list.length }
        },
        create: {
          creatorId, periodYear: period.year, periodMonth: period.month,
          grossAmount, feeAmount, netAmount, itemCount: list.length, status: 'pending'
        }
      });
      await tx.purchase.updateMany({
        where: { id: { in: list.map(p => p.id) } },
        data: { settled: true, settlementId: created.id }
      });
      return created;
    });

    results.push(settlement);
  }

  res.status(201).json({ year: period.year, month: period.month, created: results });
});

router.get('/settlements', async (req, res) => {
  const { year, month, status } = req.query;
  const where = {};
  if (year) where.periodYear = Number(year);
  if (month) where.periodMonth = Number(month);
  if (status) where.status = String(status);

  const settlements = await prisma.settlement.findMany({
    where,
    include: { creator: { select: { id: true, name: true, email: true } } },
    orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }, { createdAt: 'desc' }]
  });
  res.json({ items: settlements });
});

// 지급 완료 처리. 지급 시점의 계좌 정보를 스냅샷으로 남깁니다.
router.put('/settlements/:id/paid', async (req, res) => {
  const settlement = await prisma.settlement.findUnique({
    where: { id: req.params.id },
    include: { creator: true }
  });
  if (!settlement) return res.status(404).json({ error: 'NOT_FOUND' });
  if (settlement.status === 'paid') return res.status(409).json({ error: 'ALREADY_PAID', message: '이미 지급 완료된 정산입니다.' });

  const updated = await prisma.settlement.update({
    where: { id: settlement.id },
    data: {
      status: 'paid',
      paidAt: new Date(),
      bankSnapshot: settlement.creator.settlementBank,
      accountNumberSnapshot: settlement.creator.settlementAccountNumber,
      holderSnapshot: settlement.creator.settlementHolder
    }
  });
  res.json({ settlement: updated });
});

function toCsvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows, headers) {
  const lines = [headers.map(h => toCsvCell(h.label)).join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => toCsvCell(h.value(row))).join(','));
  }
  return '﻿' + lines.join('\r\n'); // BOM 포함: 엑셀에서 한글 깨짐 방지
}

// 정산 내역 CSV 다운로드. year/month/status 쿼리로 필터링할 수 있습니다.
router.get('/settlements/export.csv', async (req, res) => {
  const { year, month, status } = req.query;
  const where = {};
  if (year) where.periodYear = Number(year);
  if (month) where.periodMonth = Number(month);
  if (status) where.status = String(status);

  const settlements = await prisma.settlement.findMany({
    where,
    include: { creator: { select: { name: true, email: true, settlementBank: true, settlementAccountNumber: true, settlementHolder: true } } },
    orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }, { createdAt: 'desc' }]
  });

  const csv = toCsv(settlements, [
    { label: '연도', value: r => r.periodYear },
    { label: '월', value: r => r.periodMonth },
    { label: '크리에이터', value: r => r.creator.name },
    { label: '이메일', value: r => r.creator.email },
    { label: '판매액', value: r => r.grossAmount },
    { label: '수수료', value: r => r.feeAmount },
    { label: '지급액', value: r => r.netAmount },
    { label: '건수', value: r => r.itemCount },
    { label: '상태', value: r => (r.status === 'paid' ? '지급완료' : '지급대기') },
    { label: '은행', value: r => r.bankSnapshot || r.creator.settlementBank || '' },
    { label: '계좌번호', value: r => r.accountNumberSnapshot || r.creator.settlementAccountNumber || '' },
    { label: '예금주', value: r => r.holderSnapshot || r.creator.settlementHolder || '' },
    { label: '지급일', value: r => (r.paidAt ? r.paidAt.toISOString() : '') }
  ]);

  const filename = `settlements_${year || 'all'}_${month || 'all'}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

module.exports = router;
