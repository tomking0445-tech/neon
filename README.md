# NEON(루프케이드) 마켓플레이스 서버

`loopcade.html`(프론트엔드 Artifact)의 콘텐츠 목록 / 리뷰·별점 / 커뮤니티(자유·질문공략·버그제보)를
실제로 저장·서빙하는 백엔드입니다. Express + PostgreSQL(Prisma) + JWT 인증.

## 1. 로컬에서 확인 (선택)

```bash
npm install
cp .env.example .env      # DATABASE_URL, JWT_SECRET 채우기 (로컬 Postgres 필요)
npx prisma migrate dev --name init
npm run seed               # 프론트 데모 콘텐츠 8개를 DB에 넣음
npm run dev
curl http://localhost:4000/api/health
```

로컬에 Postgres가 없다면 이 단계는 건너뛰고 바로 Railway로 가도 됩니다.

## 2. GitHub에 올리기

Railway는 GitHub 레포와 연결해두면 `git push`할 때마다 자동 재배포됩니다(수동 업로드보다 효율적입니다).

```bash
cd neon-server
git init
git add .
git commit -m "NEON marketplace backend"
gh repo create neon-server --private --source=. --remote=origin --push
# gh CLI가 없다면: GitHub에서 새 저장소를 만든 뒤
# git remote add origin https://github.com/<내계정>/neon-server.git
# git branch -M main && git push -u origin main
```

`.env`는 `.gitignore`에 포함돼 있어 절대 커밋되지 않습니다. 실제 비밀값은 4단계에서 Railway 대시보드에 직접 입력하세요.

## 3. Railway 프로젝트 생성

1. https://railway.app 에서 **New Project → Deploy from GitHub repo** 선택, 방금 만든 `neon-server` 레포 선택.
2. 같은 프로젝트 안에서 **+ New → Database → PostgreSQL** 추가.
   - Railway가 자동으로 `DATABASE_URL`을 서버 서비스에 연결해줍니다(Variable Reference로 참조되어 있는지 서버 서비스의 Variables 탭에서 확인).

## 4. 환경변수 설정 (서버 서비스 → Variables 탭)

| 변수 | 값 |
|---|---|
| `DATABASE_URL` | Postgres 플러그인 추가 시 자동 생성됨 (직접 입력 불필요) |
| `JWT_SECRET` | 랜덤 문자열. 터미널에서 `openssl rand -hex 32`로 생성해서 붙여넣기 |
| `ALLOWED_ORIGINS` | 처음엔 `*` 로 두고, Artifact 프론트 도메인이 확정되면 그 도메인으로 좁히기 (쉼표로 여러 개 가능) |
| `NODE_ENV` | `production` |

`PORT`는 Railway가 자동으로 주입하므로 직접 설정하지 않습니다.

## 5. 배포 & 스키마 반영

- Railway가 `npm install` → `postinstall`(`prisma generate`) → `npm start`
  (`npx prisma db push --skip-generate && node src/index.js`) 순서로 자동 실행합니다.
- 이 프로젝트는 `prisma/migrations` 이력 없이 **`prisma db push`로 현재 `schema.prisma`를 DB에
  직접 동기화**하는 방식을 씁니다. 즉 `schema.prisma`를 수정해서 커밋·배포하면 배포될 때마다
  자동으로 테이블/컬럼이 그 내용과 일치하도록 반영됩니다. 별도로 마이그레이션 파일을
  만들거나 커밋할 필요가 없습니다.
  (참고: 나중에 정식 마이그레이션 이력을 쓰고 싶다면 로컬에서 `npx prisma migrate dev`로
  `prisma/migrations`를 만들어 커밋하고, `railway.json`/`package.json`의 시작 명령을
  `npx prisma migrate deploy && node src/index.js`로 바꾸면 됩니다.)
- 배포 후 Railway 대시보드의 서비스 → **Settings → Deploy → Run Command** 또는
  로컬에서 Railway CLI로 시드를 한 번 실행해 데모 콘텐츠를 채워 넣으세요.

```bash
npm i -g @railway/cli
railway login
railway link            # 이 프로젝트와 연결
railway run npm run seed
```

## 6. 배포 확인

```bash
curl https://<your-app>.up.railway.app/api/health
curl https://<your-app>.up.railway.app/api/contents
```

`items` 배열에 데모 콘텐츠 8개가 보이면 성공입니다.

## 7. 프론트엔드(loopcade.html) 연동 시 참고

현재 프론트는 `demoContents` 배열 + `localStorage`로 동작하는 데모 상태입니다.
서버 연결 시 아래 지점만 교체하면 됩니다 (파일 안에 동일한 주석이 이미 있습니다):

- `demoContents` → `GET /api/contents` 결과로 교체 (`window.NEON.setContents(items)` 사용)
- 로그인 버튼 → `POST /api/auth/login`, 회원가입 → `POST /api/auth/signup` 연결 후
  받은 `token`을 저장해뒀다가 이후 요청의 `Authorization: Bearer <token>` 헤더로 사용
- `communityDB.reviews` / `communityDB.posts` (localStorage) → 아래 API로 교체
  - `GET/POST /api/contents/:id/reviews`, `DELETE /api/reviews/:reviewId`
  - `GET/POST /api/contents/:id/posts`, `DELETE /api/posts/:postId`
  - `POST /api/posts/:postId/comments`, `DELETE /api/comments/:commentId`
- 구매 버튼(`purchase`) → `POST /api/contents/:id/purchase` (지금은 실제 결제 없이 기록만 남기는 스텁)

## 8. 판매 정산 기능

이번에 결제수단 선택, 크리에이터 정산 계좌 등록, 월별 정산 확정/지급, 관리자 CSV 다운로드가 추가됐습니다.

- 수수료율은 기본 20%이며 `PLATFORM_FEE_RATE`(0~1 사이 소수, 예: `0.15`) 환경변수로 바꿀 수 있습니다. 구매 시점 값이
  `Purchase.feeAmount`/`netAmount`에 스냅샷으로 저장되므로, 나중에 비율을 바꿔도 과거 거래에는 영향이 없습니다.
- 결제수단은 아직 실제 PG 연동 전 데모 스텁이며 `card | kakaopay | tosspay | bank` 중 하나를 프론트에서 골라 서버에 전달합니다.
- 정산은 "월별 확정" 방식입니다: 구매 건은 우선 미확정(`settled=false`) 상태로 쌓이고, 관리자가 특정 연월에 대해
  `POST /api/admin/settlements/generate`를 실행하면 크리에이터별로 `Settlement` 레코드가 만들어지며 해당 구매 건들이
  `settled=true`로 묶입니다. 같은 연월을 다시 실행해도 이미 정산된 건은 건드리지 않아 안전합니다.
- 관리자 지정: 로컬 또는 Railway CLI에서 `npm run make-admin -- <email>` (해제하려면 `npm run make-admin -- <email> off`).
  ```bash
  railway run npm run make-admin -- me@example.com
  ```
- 스키마가 바뀌었습니다(User.isAdmin/정산계좌, Purchase.feeAmount 등, Settlement 모델 신규). 위 5번 항목대로
  이 프로젝트는 `prisma db push`로 배포 시 자동 반영되므로, 이 커밋을 푸시하기만 하면 됩니다 — 별도
  마이그레이션 파일을 만들 필요는 없습니다.

## API 요약

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| POST | /api/auth/signup | - | 회원가입 |
| POST | /api/auth/login | - | 로그인, JWT 발급 |
| GET | /api/auth/me | 필요 | 내 정보 |
| GET | /api/contents | - | 목록 (category, q, sort 쿼리) |
| GET | /api/contents/:id | - | 상세 |
| POST | /api/contents | 필요 | 업로드 |
| PUT | /api/contents/:id | 필요(본인) | 수정 |
| DELETE | /api/contents/:id | 필요(본인) | 삭제 |
| POST | /api/contents/:id/purchase | 필요 | 구매 스텁 |
| GET | /api/contents/:id/reviews | - | 리뷰 목록 |
| POST | /api/contents/:id/reviews | 필요 | 리뷰 작성/수정(1인 1개) |
| DELETE | /api/reviews/:reviewId | 필요(본인) | 리뷰 삭제 |
| GET | /api/contents/:id/posts?board= | - | 게시글 목록(게임만) |
| POST | /api/contents/:id/posts | 필요 | 게시글 작성(게임만) |
| DELETE | /api/posts/:postId | 필요(본인) | 게시글 삭제 |
| POST | /api/posts/:postId/comments | 필요 | 댓글 작성 |
| DELETE | /api/comments/:commentId | 필요(본인) | 댓글 삭제 |
| GET | /api/settlements/account | 필요 | 내 정산 계좌 조회 |
| PUT | /api/settlements/account | 필요 | 내 정산 계좌 등록/수정 |
| GET | /api/settlements/me | 필요 | 미확정 판매 요약 + 내 정산 내역 |
| GET | /api/admin/settlements/preview | 관리자 | 연월별 미확정 판매 미리보기(크리에이터별 집계) |
| POST | /api/admin/settlements/generate | 관리자 | 연월 정산 확정 |
| GET | /api/admin/settlements | 관리자 | 정산 목록 (year, month, status 쿼리) |
| PUT | /api/admin/settlements/:id/paid | 관리자 | 지급 완료 처리 |
| GET | /api/admin/settlements/export.csv | 관리자 | 정산 내역 CSV 다운로드 |

## 보안 관련 남은 할 일

- `ALLOWED_ORIGINS`를 실제 프론트 도메인으로 좁히기
- 파일 업로드(게임 빌드, 이미지, 오디오)는 아직 없음 — S3/Cloudflare R2 등에 프리사인 URL 발급
  API를 추가하고, `Content.previewUrl` / `fileUrl`에 그 URL을 저장하도록 확장
- 실제 결제(PayPal, 국내 PG) 연동 시 `POST /api/contents/:id/purchase`를 웹훅 검증 로직으로 교체
- 성인/연령 인증, 저작권 신고 접수용 엔드포인트는 아직 없음(기획 문서의 열린 질문 참고)
