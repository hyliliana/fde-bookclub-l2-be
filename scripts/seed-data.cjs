const books = [
  ['small-questions', '작은 질문의 힘', '서도윤'],
  ['slow-days', '느린 날의 기록', '문가온'],
  ['learning-notes', '배움의 여백', '윤다온'],
];
const members = ['하늘', '다온', '서윤', '지우', '도담', '유진', '온유', '시온'];
const meetings = [
  ['weekend-question', 'small-questions', '주말, 질문 하나를 나누는 시간', '2026-11-07T14:00:00+09:00', '가상 책방 · 초록 테이블', 8, '책에서 마음에 남은 질문 하나를 골라 옵니다. 정답을 찾기보다 서로의 생각을 차분히 들어요.', [0, 1]],
  ['slow-evening', 'slow-days', '천천히 읽는 금요일 저녁', '2026-11-13T19:30:00+09:00', '가상 북카페 · 작은방', 3, '일상에서 발견한 작은 장면을 나눕니다. 이 모임은 마감 예시로 준비되어 있어요.', [0, 2, 3]],
  ['learning-saturday', 'learning-notes', '서로에게 배우는 토요일', '2026-11-14T11:00:00+09:00', '가상 온라인 독서방', 6, '최근 새롭게 배운 것과 어려웠던 순간을 이야기해요. 부담 없이 첫 신청을 해 볼 수 있는 모임입니다.', []],
  ['question-after-work', 'small-questions', '퇴근 후, 나를 위한 한 문장', '2026-11-19T19:00:00+09:00', '가상 책방 · 긴 테이블', 5, '각자 고른 문장을 소리 내어 읽고, 왜 그 문장을 골랐는지 나눠요.', [4]],
];
async function seed(client) {
  for (const [key, title, author] of books) {
    await client.query('INSERT INTO bookclub_l2.books (seed_key, title, author) VALUES ($1, $2, $3) ON CONFLICT (seed_key) DO NOTHING', [key, title, author]);
  }
  for (const [index, name] of members.entries()) {
    await client.query('INSERT INTO bookclub_l2.members (seed_key, display_name) VALUES ($1, $2) ON CONFLICT (seed_key) DO NOTHING', [`member-${index + 1}`, `${name} (가상)`]);
  }
  for (const [key, bookKey, title, startsAt, location, capacity, description, activeMemberIndices] of meetings) {
    const inserted = await client.query(`INSERT INTO bookclub_l2.meetings (seed_key, book_id, title, starts_at, location, capacity, description)
      SELECT $1, id, $3, $4, $5, $6, $7 FROM bookclub_l2.books WHERE seed_key = $2
      ON CONFLICT (seed_key) DO NOTHING RETURNING id`, [key, bookKey, title, startsAt, location, capacity, description]);
    if (!inserted.rows[0]) continue; // Existing meetings and all application/cancellation choices are preserved.
    const meetingId = inserted.rows[0].id;
    for (const memberIndex of activeMemberIndices) {
      await client.query(`INSERT INTO bookclub_l2.registrations (meeting_id, member_id, status)
        SELECT $1, id, 'active' FROM bookclub_l2.members WHERE seed_key = $2`, [meetingId, `member-${memberIndex + 1}`]);
    }
  }
}
module.exports = { seed };
