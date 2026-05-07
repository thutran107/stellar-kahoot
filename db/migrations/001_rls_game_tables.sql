-- RLS for game_sessions, participants, and answers.
-- All writes to these tables go through the server (service role key, bypasses RLS).
-- Policies here grant hosts read access to their own data from the client.

alter table game_sessions enable row level security;

create policy "host reads own sessions" on game_sessions
  for select using (
    quiz_id in (
      select id from quizzes where host_id = auth.uid()
    )
  );

alter table participants enable row level security;

create policy "host reads own session participants" on participants
  for select using (
    session_id in (
      select gs.id from game_sessions gs
      join quizzes q on q.id = gs.quiz_id
      where q.host_id = auth.uid()
    )
  );

alter table answers enable row level security;

create policy "host reads own session answers" on answers
  for select using (
    participant_id in (
      select p.id from participants p
      join game_sessions gs on gs.id = p.session_id
      join quizzes q on q.id = gs.quiz_id
      where q.host_id = auth.uid()
    )
  );
