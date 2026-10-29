import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMeetingInput, validIsoDate, parseMember, parseId, parseSearch, assertRegistrationAllowed } from '../dist/input.js';
const valid = { bookId: 1, title: ' 함께 읽기 ', startsAt: '2026-11-07T14:00:00+09:00', location: ' 가상 책방 ', capacity: 3 };

test('필수 값 공백을 제거하고 한국 시간을 UTC로 정규화한다', () => {
  assert.deepEqual(validateMeetingInput(valid), { bookId: 1, title: '함께 읽기', startsAt: '2026-11-07T05:00:00.000Z', location: '가상 책방', capacity: 3, description: '' });
});
test('공백·문자형 정원·소수·범위 초과·존재하지 않는 날짜를 필드별 거절한다', () => {
  for (const [key, value] of [['title', ' '], ['location', ' '], ['capacity', '3'], ['capacity', 1.5], ['capacity', 0], ['capacity', 51], ['bookId', '1'], ['startsAt', '2026-02-30T09:00:00+09:00'], ['description', '가'.repeat(2001)]]) {
    assert.throws(() => validateMeetingInput({ ...valid, [key]: value }), error => error.getStatus() === 400 && !!error.getResponse().fieldErrors[key]);
  }
});
test('날짜는 명시적 시간대를 포함해야 하고 윤년·월별 날짜를 구분한다', () => {
  for (const value of ['2026-11-07T14:00', '2026-04-31T14:00Z', '2026-02-29T14:00Z', '2026-11-07T25:00Z', '2026-11-07T14:00+15:00']) assert.equal(validIsoDate(value), false);
  assert.equal(validIsoDate('2028-02-29T14:00:00Z'), true);
});
test('모임 번호·가상 회원 번호·검색 입력을 안전하게 검사한다', () => {
  assert.equal(parseMember({ memberId: 2 }), 2);
  for (const value of ['1', 0, 1.5, 2147483648, null]) assert.throws(() => parseMember({ memberId: value }));
  for (const id of ['0', '-1', '1.1', '1 OR 1=1']) assert.throws(() => parseId(id));
  assert.equal(parseSearch(' 문장 '), '문장');
  assert.throws(() => parseSearch(['a', 'b']));
});
test('마지막 한 자리까지 허용하고 정원 도달 시 거절한다', () => {
  assert.doesNotThrow(() => assertRegistrationAllowed(2, 3));
  assert.throws(() => assertRegistrationAllowed(3, 3), error => error.getStatus() === 409 && /마감/.test(error.getResponse().message));
});
test('중복 신청을 거절하며 취소 후 빈자리 재신청은 허용한다', () => {
  assert.throws(() => assertRegistrationAllowed(1, 3, 'active'), error => error.getStatus() === 409 && /이미 신청/.test(error.getResponse().message));
  assert.doesNotThrow(() => assertRegistrationAllowed(1, 3, 'cancelled'));
  assert.throws(() => assertRegistrationAllowed(3, 3, 'active'), error => /이미 신청/.test(error.getResponse().message));
});
