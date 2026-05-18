-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Quizzes
create table if not exists quizzes (
  id            uuid primary key default gen_random_uuid(),
  host_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  description   text,
  is_ready      boolean not null default false,
  created_at    timestamptz not null default now()
);
alter table quizzes enable row level security;
create policy "host owns quiz" on quizzes
  for all using (auth.uid() = host_id);

-- Questions
create table if not exists questions (
  id               uuid primary key default gen_random_uuid(),
  quiz_id          uuid not null references quizzes(id) on delete cascade,
  text             text not null check (char_length(text) <= 280),
  options          jsonb not null,
  correct_index    integer not null check (correct_index between 0 and 3),
  time_limit_sec   integer not null default 20 check (time_limit_sec in (10, 20, 30)),
  point_multiplier integer not null default 1 check (point_multiplier in (1, 2)),
  order_index      integer not null default 0,
  topic            text check (topic in ('maths', 'riddles', 'idioms', 'rearrange_letters', 'general'))
);
alter table questions enable row level security;
create policy "host owns question" on questions
  for all using (
    exists (
      select 1 from quizzes
      where quizzes.id = questions.quiz_id
        and quizzes.host_id = auth.uid()
    )
  );

-- Game sessions
create table if not exists game_sessions (
  id                      uuid primary key default gen_random_uuid(),
  quiz_id                 uuid not null references quizzes(id),
  pin                     varchar(6) not null,
  state                   text not null default 'lobby'
                            check (state in ('lobby','question_active','question_reveal','ended')),
  current_question_index  integer not null default 0,
  started_at              timestamptz,
  ended_at                timestamptz
);

-- Participants
create table if not exists participants (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references game_sessions(id) on delete cascade,
  display_name    text not null,
  avatar_color    text not null,
  avatar_emoji    text not null,
  total_score     integer not null default 0,
  avg_response_ms float,
  joined_at       timestamptz not null default now()
);

-- Answers
create table if not exists answers (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  question_id    uuid not null references questions(id),
  selected_index integer not null,
  is_correct     boolean not null,
  points_earned  integer not null,
  response_ms    integer not null,
  submitted_at   timestamptz not null default now(),
  unique(participant_id, question_id)
);
