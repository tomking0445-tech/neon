const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // 서버가 기동 시점에 바로 죽는 편이, 약한 기본 시크릿으로 조용히 뜨는 것보다 안전합니다.
  throw new Error('JWT_SECRET 환경변수가 설정되지 않았습니다. Railway 프로젝트의 Variables에 추가하세요.');
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, {
    expiresIn: '30d'
  });
}

// 로그인이 필수인 라우트에 사용합니다. 토큰이 없거나 유효하지 않으면 401.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED', message: '로그인이 필요합니다.' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email, name: payload.name };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: '로그인이 만료되었거나 유효하지 않습니다.' });
  }
}

// 로그인 여부에 따라 동작이 달라지지만(찜, 좋아요 등) 필수는 아닌 라우트용.
function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = { id: payload.sub, email: payload.email, name: payload.name };
    } catch (error) {
      req.user = null;
    }
  }
  next();
}

// 관리자 전용 라우트에 사용합니다. requireAuth 다음에 연결하세요.
// 토큰 발급 시점이 아니라 매 요청마다 DB에서 최신 isAdmin 값을 확인합니다
// (관리자 권한을 회수했을 때 이미 발급된 토큰으로 계속 접근하는 것을 막기 위함).
async function requireAdmin(req, res, next) {
  try {
    const prisma = require('./db');
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { isAdmin: true } });
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'FORBIDDEN', message: '관리자만 접근할 수 있습니다.' });
    }
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { signToken, requireAuth, optionalAuth, requireAdmin };
