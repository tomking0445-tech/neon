require('dotenv').config();

const path = require('path');
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

// public/index.html(프론트엔드)이 인라인 <style>/<script>를 그대로 쓰고 있어서
// 기본 CSP를 켜면 막힙니다. 실제 런칭 전에는 nonce 기반 CSP로 다시 조여주세요.
app.use(helmet({ contentSecurityPolicy: false }));
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

// 프론트엔드(loopcade.html)를 같은 서버에서 정적으로 서빙합니다.
// 같은 출처(origin)이므로 Claude Artifact 샌드박스의 외부 fetch 제한이나 CORS 문제가 없습니다.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'NOT_FOUND', message: '요청한 API가 없습니다.' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
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
