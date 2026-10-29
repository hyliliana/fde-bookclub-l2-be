const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { once } = require('node:events');
let server, base;
before(async () => {
  const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['dist/main.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(port), DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test', DATABASE_SSL: 'false', FRONTEND_URL: 'https://bookclub.example.test' }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { await fetch(`${base}/health`); return; } catch { await new Promise(resolve => setTimeout(resolve, 50)); } }
  throw new Error('테스트 서버를 시작하지 못했습니다.');
});
after(async () => { if (server && server.exitCode === null) { const exited = once(server, 'exit'); server.kill('SIGTERM'); await exited; } });
test('실제 DB 실패를 health 503으로 반환한다', async () => {
  const r = await fetch(`${base}/health`); assert.equal(r.status, 503); assert.deepEqual(await r.json(), { status: 'error', database: 'disconnected' });
});
test('목록·현황 DB 실패에서 접속 정보를 노출하지 않는다', async () => {
  for (const route of ['/meetings', '/stats', '/books', '/members']) {
    const r = await fetch(base + route); assert.equal(r.status, 503); const body = await r.json();
    assert.match(body.message, /잠시 후/); assert.doesNotMatch(JSON.stringify(body), /postgres|127\.0\.0\.1|ECONNREFUSED/);
  }
});
test('잘못된 모임 등록·신청을 DB에 가기 전에 거절한다', async () => {
  const badMeeting = await fetch(`${base}/meetings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: ' ', bookId: '1', startsAt: 'no date', location: '', capacity: 0 }) });
  assert.equal(badMeeting.status, 400); assert.equal(Object.keys((await badMeeting.json()).fieldErrors).length, 5);
  const badMember = await fetch(`${base}/meetings/1/registrations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: '1' }) });
  assert.equal(badMember.status, 400); assert.match((await badMember.json()).fieldErrors.memberId, /가상 회원/);
});
test('존재하지 않는 초기화 API는 404이며 외부 출처에는 CORS를 허용하지 않는다', async () => {
  const reset = await fetch(`${base}/reseed`, { method: 'POST' }); assert.equal(reset.status, 404);
  const badOrigin = await fetch(`${base}/health`, { headers: { Origin: 'https://other.example.test' } }); assert.equal(badOrigin.headers.get('access-control-allow-origin'), null);
  const localOrigin = await fetch(`${base}/health`, { headers: { Origin: 'http://localhost:3001' } }); assert.equal(localOrigin.headers.get('access-control-allow-origin'), 'http://localhost:3001');
});
