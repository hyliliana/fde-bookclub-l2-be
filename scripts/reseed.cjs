const { withDatabase } = require('./db.cjs');
const { setup } = require('./schema.cjs');
const { seed } = require('./seed-data.cjs');
if (!process.argv.includes('--confirm-level2')) {
  console.error('이 명령은 Level 2의 모든 모임·신청을 지우고 가상 자료를 다시 만듭니다. 실행하려면 pnpm db:reseed --confirm-level2를 사용해 주세요. Level 1은 변경하지 않습니다.');
  process.exitCode = 1;
} else {
  withDatabase(async client => {
    await setup(client);
    // Qualified tables and no CASCADE: unexpected cross-schema dependencies cause rollback, not wider deletion.
    await client.query('TRUNCATE TABLE bookclub_l2.registrations, bookclub_l2.meetings, bookclub_l2.members, bookclub_l2.books RESTART IDENTITY');
    await seed(client);
    console.log('Level 2만 초기화하고 가상 자료를 다시 만들었습니다. Level 1 데이터는 변경하지 않았습니다.');
  });
}
