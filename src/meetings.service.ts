import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from './database.service.js';
import { assertRegistrationAllowed, MeetingInput } from './input.js';

const activeCount = `(SELECT count(*)::integer FROM bookclub_l2.registrations ar WHERE ar.meeting_id = m.id AND ar.status = 'active')`;
const meetingColumns = `m.id, m.book_id AS "bookId", b.title AS "bookTitle", b.author AS "bookAuthor",
  m.title, m.starts_at AS "startsAt", m.location, m.capacity, m.description, m.created_at AS "createdAt",
  ${activeCount} AS "activeCount", (m.capacity - ${activeCount}) AS "remainingSeats"`;
const registrationColumns = `COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'id', r.id, 'memberId', r.member_id, 'memberName', mb.display_name, 'status', r.status,
  'createdAt', to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'canceledAt', CASE WHEN r.canceled_at IS NULL THEN NULL ELSE to_char(r.canceled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END
) ORDER BY r.created_at, r.id) FROM bookclub_l2.registrations r JOIN bookclub_l2.members mb ON mb.id = r.member_id WHERE r.meeting_id = m.id), '[]'::jsonb) AS registrations`;

@Injectable()
export class MeetingsService {
  constructor(private readonly db: DatabaseService) {}
  async books() { return (await this.db.query('SELECT id, title, author FROM bookclub_l2.books ORDER BY id')).rows; }
  async members() { return (await this.db.query('SELECT id, display_name AS "displayName" FROM bookclub_l2.members ORDER BY id')).rows; }
  async list(search: string) {
    const literalSearch = search.replace(/[\\%_]/g, '\\$&');
    return (await this.db.query(`SELECT ${meetingColumns} FROM bookclub_l2.meetings m JOIN bookclub_l2.books b ON b.id = m.book_id
      WHERE $1 = '' OR m.title ILIKE $2 OR b.title ILIKE $2 ORDER BY m.starts_at, m.id`, [search, `%${literalSearch}%`])).rows;
  }
  async detail(id: number) {
    // One SQL statement keeps counts and participant statuses in the same MVCC snapshot.
    const result = await this.db.query(`SELECT ${meetingColumns}, ${registrationColumns}
      FROM bookclub_l2.meetings m JOIN bookclub_l2.books b ON b.id = m.book_id WHERE m.id = $1`, [id]);
    if (!result.rows[0]) throw this.missingMeeting();
    return result.rows[0];
  }
  async create(input: MeetingInput) {
    const result = await this.db.query<{ id: number }>(`INSERT INTO bookclub_l2.meetings (book_id, title, starts_at, location, capacity, description)
      SELECT id, $2, $3, $4, $5, $6 FROM bookclub_l2.books WHERE id = $1 RETURNING id`,
    [input.bookId, input.title, input.startsAt, input.location, input.capacity, input.description]);
    if (!result.rows[0]) throw new BadRequestException({ message: '함께 읽을 책을 다시 선택해 주세요.', fieldErrors: { bookId: '등록된 책을 선택해 주세요.' } });
    return this.detail(result.rows[0].id);
  }
  async stats() {
    const result = await this.db.query(`WITH counts AS (
      SELECT m.id, m.capacity, count(r.id)::integer AS active_count
      FROM bookclub_l2.meetings m LEFT JOIN bookclub_l2.registrations r ON r.meeting_id = m.id AND r.status = 'active'
      GROUP BY m.id
    ) SELECT count(*)::integer AS "totalMeetings", COALESCE(sum(active_count), 0)::integer AS "activeRegistrations",
      COALESCE(sum(capacity - active_count), 0)::integer AS "remainingSeats" FROM counts`);
    return result.rows[0];
  }
  async register(meetingId: number, memberId: number) {
    await this.db.transaction(async client => {
      const meeting = await this.lockMeeting(client, meetingId);
      await this.ensureMember(client, memberId);
      const previous = await client.query<{ status: string }>('SELECT status FROM bookclub_l2.registrations WHERE meeting_id = $1 AND member_id = $2', [meetingId, memberId]);
      const count = await client.query<{ count: number }>("SELECT count(*)::integer AS count FROM bookclub_l2.registrations WHERE meeting_id = $1 AND status = 'active'", [meetingId]);
      assertRegistrationAllowed(count.rows[0].count, meeting.capacity, previous.rows[0]?.status);
      await client.query(`INSERT INTO bookclub_l2.registrations (meeting_id, member_id, status) VALUES ($1, $2, 'active')
        ON CONFLICT (meeting_id, member_id) DO UPDATE SET status = 'active', created_at = now(), canceled_at = NULL`, [meetingId, memberId]);
    });
    return this.detail(meetingId);
  }
  async cancel(meetingId: number, memberId: number) {
    await this.db.transaction(async client => {
      await this.lockMeeting(client, meetingId);
      await this.ensureMember(client, memberId);
      const result = await client.query(`UPDATE bookclub_l2.registrations
        SET status = 'cancelled', canceled_at = COALESCE(canceled_at, now())
        WHERE meeting_id = $1 AND member_id = $2 RETURNING id`, [meetingId, memberId]);
      if (!result.rowCount) throw new NotFoundException({ message: '이 회원의 신청 내역이 없습니다.' });
    });
    return this.detail(meetingId);
  }
  private async lockMeeting(client: PoolClient, id: number) {
    // Every write to a meeting's registrations takes this same row lock first.
    const result = await client.query<{ id: number; capacity: number }>('SELECT id, capacity FROM bookclub_l2.meetings WHERE id = $1 FOR UPDATE', [id]);
    if (!result.rows[0]) throw this.missingMeeting();
    return result.rows[0];
  }
  private async ensureMember(client: PoolClient, id: number) {
    const member = await client.query('SELECT id FROM bookclub_l2.members WHERE id = $1', [id]);
    if (!member.rows[0]) throw new BadRequestException({ message: '실습할 가상 회원을 다시 선택해 주세요.', fieldErrors: { memberId: '등록된 가상 회원을 선택해 주세요.' } });
  }
  private missingMeeting() { return new NotFoundException({ message: '모임을 찾을 수 없습니다. 목록에서 다시 선택해 주세요.' }); }
}
