// 플랫폼 수수료 계산. 프론트(loopcade.html)에도 "제작자 80% · 플랫폼 20%"로 안내돼 있으므로
// 기본값을 0.2로 둡니다. 실제 운영 시 카테고리별/구간별 수수료가 필요하면 이 파일만 확장하세요.
const FEE_RATE = (() => {
  const fromEnv = Number(process.env.PLATFORM_FEE_RATE);
  return Number.isFinite(fromEnv) && fromEnv >= 0 && fromEnv < 1 ? fromEnv : 0.2;
})();

// 구매 1건에 대한 수수료/정산액을 계산합니다. 원 단위 절사(내림) 후 나머지를 크리에이터 몫으로 둡니다.
function computeSplit(amount) {
  const gross = Math.max(0, Math.trunc(Number(amount) || 0));
  const feeAmount = Math.floor(gross * FEE_RATE);
  const netAmount = gross - feeAmount;
  return { feeAmount, netAmount };
}

const PAYMENT_METHODS = ['card', 'kakaopay', 'tosspay', 'bank', 'demo'];

module.exports = { FEE_RATE, computeSplit, PAYMENT_METHODS };
