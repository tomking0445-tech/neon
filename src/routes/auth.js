const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const prisma = require('../db');
const { signToken, requireAuth } = require('../auth');

const router = express.Router();

// 무차별 대입 로그인 시도 방지 (15분당 IP 하나당 20회)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, isCreator: user.isCreator, isAdmin: user.isAdmin };
}

router.post('/signup', authLimiter, async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: '이메일, 비밀번호, 닉네임을 모두 입력하세요.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'WEAK_PASSWORD', message: '비밀번호는 8자 이상이어야 합니다.' });
  }

  const existing = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
  if (existing) return res.status(409).json({ error: 'EMAIL_TAKEN', message: '이미 가입된 이메일입니다.' });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email: String(email).toLowerCase(), passwordHash, name: String(name).slice(0, 40) }
  });

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: '이메일과 비밀번호를 입력하세요.' });
  }

  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
  if (!user) return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '이메일 또는 비밀번호가 올바르지 않습니다.' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '이메일 또는 비밀번호가 올바르지 않습니다.' });

  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ user: publicUser(user) });
});

module.exports = router;
