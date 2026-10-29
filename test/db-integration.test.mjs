import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
if (enabled) config({ quiet: true });
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let processHandle, base, client, books, members;
const createdIds = [];
const prefix = `검증-${randomUUID().slice(0, 8)}`;
const json = async (route, body) => {
  const response = await fetch(base + route, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

before(async () => {
  if (!enabled) return;
  assert.ok(process.env.DATABASE_URL, '실제 Render DATABASE_URL 설정이 필요합니다.');
  client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: true } });
  await client.connect();
  const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  base = `http://127.0.0.1:${port}`;
  processHandle = spawn(process.execPath, ['dist/main.js'], { cwd, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { const result = await json('/health'); if (result.status === 200) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, '실제 DB와 테스트 API가 연결되어야 합니다.');
  books = (await json('/books')).body;
  members = (await json('/members')).body;
  assert.ok(books.length >= 1 && members.length >= 5, 'db:setup과 db:seed를 먼저 실행해 주세요.');
});

after(async () => {
  if (!enabled) return;
  if (client && createdIds.length) {
    await client.query('BEGIN');
    try {
      await client.query('DELETE FROM bookclub_l2.registrations WHERE meeting_id = ANY($1::int[])', [createdIds]);
      await client.query('DELETE FROM bookclub_l2.meetings WHERE id = ANY($1::int[])', [createdIds]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
  await client?.end();
  if (processHandle && processHandle.exitCode === null) { const exited = once(processHandle, 'exit'); processHandle.kill('SIGTERM'); await exited; }
});

async function createMeeting(capacity, suffix) {
  const result = await json('/meetings', { bookId: books[0].id, title: `${prefix}-${suffix}`, startsAt: '2026-11-29T14:00:00+09:00', location: '가상 검증 장소', capacity, description: '자동 검사에서만 사용하는 가상 모임입니다.' });
  assert.equal(result.status, 201); createdIds.push(result.body.id); return result.body;
}

test('실제 DB: 마지막 한 자리에 동시 신청해도 한 명만 성공하고 취소·재신청이 일관된다', { skip: !enabled, timeout: 60000 }, async () => {
  const meeting = await createMeeting(1, '정원');
  const results = await Promise.all(members.slice(0, 5).map(member => json(`/meetings/${meeting.id}/registrations`, { memberId: member.id })));
  assert.equal(results.filter(result => result.status === 201).length, 1);
  assert.equal(results.filter(result => result.status === 409).length, 4);
  let detail = (await json(`/meetings/${meeting.id}`)).body;
  assert.equal(detail.activeCount, 1); assert.equal(detail.remainingSeats, 0);
  const winner = detail.registrations.find(registration => registration.status === 'active');
  const duplicate = await json(`/meetings/${meeting.id}/registrations`, { memberId: winner.memberId });
  assert.equal(duplicate.status, 409); assert.match(duplicate.body.message, /이미 신청/);
  for (let i = 0; i < 2; i++) {
    const cancelled = await json(`/meetings/${meeting.id}/registrations/cancel`, { memberId: winner.memberId });
    assert.equal(cancelled.status, 200); assert.equal(cancelled.body.activeCount, 0); assert.equal(cancelled.body.remainingSeats, 1);
  }
  const reapplied = await json(`/meetings/${meeting.id}/registrations`, { memberId: winner.memberId });
  assert.equal(reapplied.status, 201); assert.equal(reapplied.body.activeCount, 1);
  assert.equal(reapplied.body.registrations.length, 1); assert.equal(reapplied.body.registrations[0].id, winner.id);
  assert.equal(reapplied.body.registrations[0].canceledAt, null);
});

test('실제 DB: 같은 회원의 동시 신청은 한 건만 저장되고 검색·현황이 DB와 일치한다', { skip: !enabled, timeout: 60000 }, async () => {
  const meeting = await createMeeting(4, '중복');
  const results = await Promise.all(Array.from({ length: 8 }, () => json(`/meetings/${meeting.id}/registrations`, { memberId: members[0].id })));
  assert.equal(results.filter(result => result.status === 201).length, 1);
  assert.equal(results.filter(result => result.status === 409).length, 7);
  const stored = await client.query('SELECT count(*)::integer AS count FROM bookclub_l2.registrations WHERE meeting_id = $1 AND member_id = $2', [meeting.id, members[0].id]);
  assert.equal(stored.rows[0].count, 1);
  const search = await json(`/meetings?search=${encodeURIComponent(meeting.title)}`);
  assert.equal(search.status, 200); assert.equal(search.body.length, 1); assert.equal(search.body[0].id, meeting.id);
  const stats = await json('/stats');
  const expected = await client.query(`SELECT
    (SELECT count(*)::integer FROM bookclub_l2.meetings) AS "totalMeetings",
    (SELECT count(*)::integer FROM bookclub_l2.registrations WHERE status = 'active') AS "activeRegistrations",
    ((SELECT COALESCE(sum(capacity),0) FROM bookclub_l2.meetings) - (SELECT count(*) FROM bookclub_l2.registrations WHERE status = 'active'))::integer AS "remainingSeats"`);
  assert.deepEqual(stats.body, expected.rows[0]);
});
