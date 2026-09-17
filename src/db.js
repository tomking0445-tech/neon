const { PrismaClient } = require('@prisma/client');

// Railway는 컨테이너를 재사용하지 않으므로 전역 캐시는 필수 아니지만,
// 로컬 개발(nodemon 등) 시 커넥션이 누적되는 것을 막기 위해 싱글턴으로 둡니다.
const prisma = global.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;

module.exports = prisma;
