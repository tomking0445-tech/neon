// 크리에이터 본인의 판매 정산 화면용 API.
// - 정산 계좌 등록/조회
// - 이번 달(미확정) 예상 정산액 + 과거 확정 정산 내역
const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../auth');
const { FEE_RATE } = require('../fee');

const router = express.Router();

const BANKS = [
  'KB국민', '신한', '우리', '하나', 'NH농협', 'IBK기업', '카카오뱅크', '토스뱅크', 'SC제일', '새마을금고', '기타'
];

function publicAccount(user) {
  return {
    bank: user.settlementBank || null,
    accountNumber: user.settlementAccountNumber || null,
    holder: user.settlementHolder || null,
    registered: Boolean(user.settlementBank && user.settlementAccountNumber && user.settlementHolder)
  };
}

router.get('/account', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ account: publicAccount(user), banks: BANKS });
});

// 데모 수준 저장입니다. 실제 서비스에서는 계좌 실명조회 API 연동과 암호화 저장이 필요합니다.
router.put('/account', requireAuth, async (req, res) => {
  const { bank, accountNumber, holder } = req.body || {};
  if (!bank || !accountNumber || !holder) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: '은행, 계좌번호, 예금주를 모두 입력하세요.' });
  }
  const cleanAccountNumber = String(accountNumber).replace(/[^0-9-]/g, '').slice(0, 40);
  if (!cleanAccountNumber) {
    return res.status(400).json({ error: 'INVALID_ACCOUNT', message: '계좌번호 형식을 확인해 주세요.' });
  }

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      settlementBank: String(bank).slice(0, 40),
      settlementAccountNumber: cleanAccountNumber,
      settlementHolder: String(holder).slice(0, 40)
    }
  });
  res.json({ account: publicAccount(user) });
});

// 아직 관리자가 정산 확정을 하지 않은 판매분 요약 + 과거 확정 정산 내역.
router.get('/me', requireAuth, async (req, res) => {
  const now = new Date();

  const [pendingAgg, settlements, user] = await Promise.all([
    prisma.purchase.aggregate({
      where: { content: { creatorId: req.user.id }, settled: false },
      _sum: { amount: true, feeAmount: true, netAmount: true },
      _count: { _all: true }
    }),
    prisma.settlement.findMany({
      where: { creatorId: req.user.id },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }]
    }),
    prisma.user.findUnique({ where: { id: req.user.id } })
  ]);

  res.json({
    feeRate: FEE_RATE,
    account: publicAccount(user),
    pending: {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      grossAmount: pendingAgg._sum.amount || 0,
      feeAmount: pendingAgg._sum.feeAmount || 0,
      netAmount: pendingAgg._sum.netAmount || 0,
      itemCount: pendingAgg._count._all || 0,
      note: '아직 관리자가 정산을 확정하지 않은 판매분이에요. 매월 정산 주기에 확정되면 아래 내역에 추가됩니다.'
    },
    settlements
  });
});

module.exports = router;
