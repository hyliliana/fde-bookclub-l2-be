require('dotenv').config({ quiet: true });
const { Client } = require('pg');

async function withDatabase(operation) {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL을 .env 또는 실행 환경에 설정해 주세요.');
    process.exitCode = 1;
    return;
  }
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
    application_name: 'bookclub-level2-setup',
  });
  try {
    await client.connect();
    await client.query('BEGIN');
    await operation(client);
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('DB 작업을 완료하지 못했습니다. 연결 설정과 테이블 준비 상태를 확인해 주세요.');
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}
module.exports = { withDatabase };
