-- db/migrations/002_add_question_topic.sql
alter table questions
  add column if not exists topic text
    check (topic in ('maths', 'riddles', 'idioms', 'rearrange_letters', 'general'));
