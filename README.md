# 독서모임 신청 · Level 2 백엔드

모임을 등록하고 참가 신청·취소를 처리하는 NestJS API입니다. 화면을 우회한 요청에도 서버가 정원과 중복 신청을 검사합니다. 실제 PostgreSQL의 `bookclub_l2` 스키마만 사용하며, Level 1과 데이터 공간을 분리합니다.

## 준비·실행

Node.js 22 이상과 pnpm을 사용합니다.

```bash
pnpm install --frozen-lockfile
cp .env.example .env
# .env에 Render PostgreSQL의 실제 연결 설정을 입력합니다.
pnpm db:setup
pnpm db:seed
pnpm build
pnpm start
```

기본 주소는 `http://localhost:4001`입니다. 허용하는 로컬 화면은 `http://localhost:3001`입니다. 개발 소스 변경 후 `pnpm build`를 실행하면 `pnpm start:dev`의 감시 프로세스가 재시작합니다.

| 설정값 | 의미 |
|---|---|
| `DATABASE_URL` | 로컬은 Render External, 같은 지역 Render 서비스는 Internal 연결 주소 |
| `DATABASE_SSL` | 기본 `true`, 인증서를 검증합니다. 같은 지역 Render Internal 연결에서만 `false`를 명시할 수 있습니다. |
| `FRONTEND_URL` | 실제 Vercel 주소. 여러 주소는 쉼표로 구분합니다. |
| `PORT` | 로컬 기본 4001. Render가 제공하는 PORT 값을 사용합니다. |

실제 DB 주소는 `.env` 또는 Render 설정에만 넣고 GitHub에 올리지 않습니다. `.env.example`에는 예시 값만 있습니다.

## 데이터와 규칙

- `books`: 함께 읽을 가상 책 3권
- `members`: 실습용 가상 회원 8명
- `meetings`: 초기 모임 4개(빈 모임·일부 신청·마감 사례)
- `registrations`: 모임·회원별 신청 상태, 취소 시간

신청과 취소는 모두 트랜잭션 안에서 해당 모임을 `FOR UPDATE`로 잠급니다. 이전 신청 상태와 현재 참가 수를 읽고 검사한 다음 기록합니다. 따라서 동시에 한 자리를 신청하더라도 정원을 초과하지 않으며, `(meeting_id, member_id)` 유일성 제약으로 같은 사람의 기록이 중복되지 않습니다. 취소 후 재신청은 기존 기록을 다시 활성화합니다. 반복 취소가 남은 자리를 계속 늘리지 않습니다.

가상 회원 선택은 로그인이 아닙니다. 실제 개인정보를 사용하지 않는 공개 실습 앱이며, 실제 운영의 인증·권한 기능을 제공한다고 주장하지 않습니다.

## API 계약

| 방식·경로 | 입력 | 응답 |
|---|---|---|
| `GET /books` | 없음 | `{id,title,author}[]` |
| `GET /members` | 없음 | `{id,displayName}[]` |
| `GET /meetings?search=검색어` | 제목·책 이름 검색, 최대 120자 | `Meeting[]` |
| `GET /meetings/:id` | 모임 번호 | `MeetingDetail` |
| `POST /meetings` | 아래 등록 본문 | 201 `MeetingDetail` |
| `POST /meetings/:id/registrations` | `{memberId:number}` | 201 `MeetingDetail` |
| `POST /meetings/:id/registrations/cancel` | `{memberId:number}` | 200 `MeetingDetail` |
| `GET /stats` | 없음 | `{totalMeetings,activeRegistrations,remainingSeats}` |
| `GET /health` | 없음 | 실제 DB 질의 성공 200, 실패 503 |

`Meeting` 필드:

```text
id, bookId, bookTitle, bookAuthor, title, startsAt,
location, capacity, description, activeCount, remainingSeats, createdAt
```

`MeetingDetail`에는 다음 배열이 추가됩니다.

```text
registrations: [{id, memberId, memberName, status, createdAt, canceledAt}]
status: "active" 또는 "cancelled"
```

모임 등록 예시:

```json
{
  "bookId": 1,
  "title": "토요일, 함께 읽기",
  "startsAt": "2026-11-07T14:00:00+09:00",
  "location": "가상 책방",
  "capacity": 6,
  "description": "기억에 남는 문장을 한 개씩 나눕니다."
}
```

날짜는 시간대를 포함한 ISO 형식을 받고 UTC로 저장합니다. 화면에서는 한국 시간으로 보여 주세요. 정원은 1~50의 정수, 모임명은 120자, 장소는 200자, 소개는 2,000자 이내입니다. 존재하는 책과 가상 회원만 선택할 수 있습니다.

오류는 `{message, fieldErrors?}` 형식입니다. 입력 오류 400, 없는 모임/신청 404, 정원 마감/중복 신청 409, DB 연결 실패 503으로 구분합니다. DB 주소와 원시 오류는 노출하지 않습니다.

## 가상 데이터 재생성

`pnpm db:seed`는 없는 초기 데이터를 추가하며 기존 신청과 취소 상태를 보존합니다. 일반 재시작 시 사용자 작업을 초기화하지 않습니다.

아래 명령은 **Level 2의 모임·신청·회원·책을 전부 지우고** 초기 가상 자료를 다시 만듭니다.

```bash
pnpm db:reseed --confirm-level2
```

이 명령은 `bookclub_l2`의 네 테이블만 대상으로 실행합니다. `CASCADE`를 쓰지 않으므로 예상치 못한 다른 스키마 의존성이 있으면 작업이 실패하고 롤백됩니다. Level 1은 변경하지 않습니다. 웹에서 호출하는 초기화 API는 없습니다.

## 검사

```bash
pnpm test
# 실제 Render DB 설정과 초기 데이터가 준비된 뒤에만 실행:
RUN_DB_INTEGRATION=1 pnpm test:integration
```

기본 검사는 입력·날짜·규칙 경계·실제 HTTP 오류·CORS·DB 실패 상태를 확인합니다. 통합 검사는 실제 DB에서 마지막 한 자리의 동시 신청, 동일 회원 동시 신청, 취소·재신청, 검색·현황을 검증합니다. 검사에서 새로 만든 모임과 신청만 마지막에 지우며, 기존 자료와 Level 1을 변경하지 않습니다.

## Render 배포

- 프론트엔드와 별도 GitHub 저장소를 사용합니다.
- DB와 Web Service의 지역을 맞추고 환경 변수를 등록합니다.
- Build: `corepack enable && pnpm install --frozen-lockfile && pnpm build`
- Start: `pnpm db:setup && pnpm db:seed && pnpm start`
- Node: `NODE_VERSION=24`
- 실제 배포 후 `/health`, 정상 신청·취소·정원 초과·중복 거절을 화면과 API에서 다시 확인합니다.

무료 Render Web Service는 대기 상태에서 첫 접속이 느릴 수 있습니다. 무료 PostgreSQL은 워크스페이스당 하나이며 생성 30일 후 만료됩니다. 장기 운영 전에 [현재 Render 플랜 조건](https://render.com/docs/free)을 확인하세요.

## 검증 상태

자동 검사와 실제 DB 통합 검사는 별도 상태입니다. 실제 DB 접속·공개 배포 확인 전에는 과제 완료로 표시하지 않습니다. 요구사항은 [기획서.md](./기획서.md)에 있습니다.
