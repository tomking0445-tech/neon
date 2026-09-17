// 프론트엔드(loopcade.html)의 demoContents와 동일한 샘플 데이터를 DB에 넣습니다.
// 실행: npm run seed  (DATABASE_URL이 설정된 상태에서)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./db');

const demoContents = [
  { id: 'demo-cyber', name: '네온 러너 : 사이버 시티', creator: 'Pixelwave', category: 'webgame', price: 2900, tags: ['액션', '브라우저 플레이'], art: 'cyber', initial: 'P' },
  { id: 'demo-orb', name: '드림 오브젝트 컬렉션', creator: 'mellow.ai', category: 'image', price: 4900, tags: ['3D 아트', '고해상도'], art: 'orb', initial: 'M' },
  { id: 'demo-ambient', name: 'Deep Focus · 앰비언트 팩', creator: 'Sound Garden', category: 'audio', price: 3900, tags: ['앰비언트', '10 TRACKS'], art: 'audio', initial: 'S' },
  { id: 'demo-icons', name: '말랑말랑 3D 아이콘 팩', creator: 'Jelly Lab', category: 'asset', price: 9900, tags: ['3D 아이콘', 'PNG'], art: 'icons', initial: 'J' },
  { id: 'demo-orbit', name: 'Orbit Explorer', creator: 'Orbit Studio', category: 'webgame', price: 3900, tags: ['우주 탐험', '캐주얼'], art: 'space', initial: 'O' },
  { id: 'demo-landscape', name: '고요한 행성의 풍경들', creator: 'Otherworld', category: 'image', price: 5900, tags: ['판타지', '배경 이미지'], art: 'landscape', initial: 'W' },
  { id: 'demo-lofi', name: 'Late Night · 로파이 루프', creator: 'room404', category: 'audio', price: 2900, tags: ['LO-FI', '루프 사운드'], art: 'beat', initial: 'R' },
  { id: 'demo-ui', name: 'Nova 대시보드 UI 키트', creator: 'Form & Function', category: 'asset', price: 14900, tags: ['UI 키트', '템플릿'], art: 'ui', initial: 'F' }
];

async function main() {
  for (const item of demoContents) {
    const email = `${item.creator.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@neon.demo`;
    const passwordHash = await bcrypt.hash('demo-password-not-for-real-login', 12);

    const creator = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: item.creator, passwordHash, isCreator: true }
    });

    // id를 프론트 demoContents와 동일하게 유지하기 위해 upsert에 id를 명시합니다.
    await prisma.content.upsert({
      where: { id: item.id },
      update: {
        name: item.name, category: item.category, price: item.price,
        tags: item.tags, art: item.art, initial: item.initial, creatorId: creator.id
      },
      create: {
        id: item.id, name: item.name, category: item.category, price: item.price,
        tags: item.tags, art: item.art, initial: item.initial, creatorId: creator.id
      }
    });
  }

  console.log(`시드 완료: 콘텐츠 ${demoContents.length}개.`);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
