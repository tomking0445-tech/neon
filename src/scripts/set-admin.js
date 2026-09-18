// 특정 이메일 계정을 관리자로 지정/해제합니다.
// 사용법: node src/scripts/set-admin.js <email> [off]
//   node src/scripts/set-admin.js me@example.com        → 관리자로 지정
//   node src/scripts/set-admin.js me@example.com off    → 관리자 해제
// Railway에 배포된 DB에 적용하려면 로컬에서 Railway CLI로 실행하세요:
//   railway run node src/scripts/set-admin.js me@example.com
require('dotenv').config();
const prisma = require('../db');

async function main() {
  const email = process.argv[2];
  const off = process.argv[3] === 'off';
  if (!email) {
    console.error('사용법: node src/scripts/set-admin.js <email> [off]');
    process.exit(1);
  }

  const user = await prisma.user.update({
    where: { email: email.toLowerCase() },
    data: { isAdmin: !off }
  }).catch(() => null);

  if (!user) {
    console.error(`해당 이메일의 사용자를 찾을 수 없어요: ${email}`);
    process.exit(1);
  }

  console.log(`${user.email} 계정을 관리자에서 ${off ? '해제' : '지정'}했습니다.`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
