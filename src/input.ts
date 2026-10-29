import { BadRequestException, ConflictException } from '@nestjs/common';

export interface MeetingInput {
  bookId: number;
  title: string;
  startsAt: string;
  location: string;
  capacity: number;
  description: string;
}

const fieldError = (fieldErrors: Record<string, string>) => new BadRequestException({ message: '입력한 내용을 확인해 주세요.', fieldErrors });
const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2147483647;

function bodyObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException({ message: '입력 내용을 올바른 형식으로 보내 주세요.' });
  return value as Record<string, unknown>;
}

export function validIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [, y, mo, d, h, mi, se, , oh, om] = match;
  const [year, month, day, hour, minute, second] = [y, mo, d, h, mi, se ?? '0'].map(Number);
  if (year < 2000 || year > 9999 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  if (oh && (Number(oh) > 14 || Number(om) > 59 || (Number(oh) === 14 && Number(om) > 0))) return false;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= lastDay && Number.isFinite(Date.parse(value));
}

export function validateMeetingInput(value: unknown): MeetingInput {
  const source = bodyObject(value);
  const errors: Record<string, string> = {};
  const text = (key: string, objectLabel: string, subjectLabel: string, max: number, required: boolean): string => {
    const raw = source[key];
    if (raw === undefined && !required) return '';
    if (typeof raw !== 'string') {
      errors[key] = raw === undefined ? `${objectLabel} 입력해 주세요.` : `${subjectLabel} 글자로 입력해 주세요.`;
      return '';
    }
    const result = raw.trim();
    if (required && !result) errors[key] = `${objectLabel} 입력해 주세요.`;
    else if (result.length > max) errors[key] = `${subjectLabel} ${max}자 이내로 입력해 주세요.`;
    return result;
  };
  const title = text('title', '모임 이름을', '모임 이름은', 120, true);
  const location = text('location', '장소를', '장소는', 200, true);
  const description = text('description', '모임 소개를', '모임 소개는', 2000, false);
  if (!positiveId(source.bookId)) errors.bookId = '함께 읽을 책을 선택해 주세요.';
  if (!Number.isInteger(source.capacity) || typeof source.capacity !== 'number' || source.capacity < 1 || source.capacity > 50) errors.capacity = '정원은 1명부터 50명 사이의 정수로 입력해 주세요.';
  if (!validIsoDate(source.startsAt)) errors.startsAt = '모임 날짜와 시간을 올바르게 선택해 주세요.';
  if (Object.keys(errors).length) throw fieldError(errors);
  return { bookId: source.bookId as number, title, startsAt: new Date(source.startsAt as string).toISOString(), location, capacity: source.capacity as number, description };
}

export function parseId(value: string): number {
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) throw new BadRequestException({ message: '모임 번호가 올바르지 않습니다.' });
  return Number(value);
}

export function parseMember(value: unknown): number {
  const source = bodyObject(value);
  if (!positiveId(source.memberId)) throw fieldError({ memberId: '실습할 가상 회원을 선택해 주세요.' });
  return source.memberId;
}

export function parseSearch(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.trim().length > 120) throw fieldError({ search: '검색어는 120자 이내로 입력해 주세요.' });
  return value.trim();
}

// This check is always called after the meeting row is locked inside a DB transaction.
export function assertRegistrationAllowed(activeCount: number, capacity: number, status?: string): void {
  if (status === 'active') throw new ConflictException({ message: '이미 신청한 모임입니다.' });
  if (activeCount >= capacity) throw new ConflictException({ message: '정원이 마감되었습니다.' });
}
