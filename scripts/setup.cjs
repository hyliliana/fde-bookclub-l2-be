const { withDatabase } = require('./db.cjs');
const { setup } = require('./schema.cjs');
withDatabase(async client => {
  await setup(client);
  console.log('Level 2의 책·모임·가상 회원·신청 테이블을 준비했습니다. 다른 스키마는 변경하지 않았습니다.');
});
