const { withDatabase } = require('./db.cjs');
const { seed } = require('./seed-data.cjs');
withDatabase(async client => {
  await seed(client);
  console.log('가상 책 3권·회원 8명·모임 4개의 초기 자료를 준비했습니다. 기존 모임과 신청·취소 내역을 보존했습니다.');
});
