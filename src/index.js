require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const contentsRoutes = require('./routes/contents');
const reviewsRoutes = require('./routes/reviews');
const postsRoutes = require('./routes/posts');
const postsTopRoutes = require('./routes/posts-top');
const commentsRoutes = require('./routes/comments');

const app = express();

// Railway/프록시 뒤에서 rate-limit이 IP를 올바르게 인식하게 합니다.
app.set('trust proxy', 1);

app.use(helmet());
app.use(express.json({ limit: '1mb' }));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
app.use(cors({
  origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  credentials: false
}));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'neon-marketplace-server', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/contents', contentsRoutes);
// mergeParams로 :contentId를 받아야 하므로, contentId를 가진 경로에 서브라우터를 붙입니다.
app.use('/api/contents/:contentId/reviews', reviewsRoutes);
app.use('/api/contents/:contentId/posts', postsRoutes);
app.use('/api/posts', postsTopRoutes);
app.use('/api/comments', commentsRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: '요청한 API가 없습니다.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: '서버에서 오류가 발생했습니다.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`NEON 서버가 ${PORT}번 포트에서 실행 중입니다.`);
});
