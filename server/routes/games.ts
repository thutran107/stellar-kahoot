import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

export const gamesRouter = Router();
gamesRouter.use(requireAuth);

gamesRouter.get('/', async (req: AuthRequest, res) => {
  const { data: userQuizzes, error: qErr } = await supabaseAdmin
    .from('quizzes')
    .select('id, title')
    .eq('host_id', req.userId!);

  if (qErr) { res.status(500).json({ error: qErr.message }); return; }
  if (!userQuizzes?.length) { res.json([]); return; }

  const quizMap = new Map(userQuizzes.map((q) => [q.id, q.title]));
  const quizIds = Array.from(quizMap.keys());

  const { data: sessions, error: sErr } = await supabaseAdmin
    .from('game_sessions')
    .select('id, quiz_id, pin, state, started_at, ended_at')
    .in('quiz_id', quizIds)
    .order('started_at', { ascending: false });

  if (sErr) { res.status(500).json({ error: sErr.message }); return; }
  if (!sessions?.length) { res.json([]); return; }

  const sessionIds = sessions.map((s) => s.id);
  const { data: pRows, error: pErr } = await supabaseAdmin
    .from('participants')
    .select('session_id')
    .in('session_id', sessionIds);
  if (pErr) { res.status(500).json({ error: pErr.message }); return; }

  const countMap = new Map<string, number>();
  for (const p of pRows ?? []) {
    countMap.set(p.session_id, (countMap.get(p.session_id) ?? 0) + 1);
  }

  res.json(
    sessions.map((s) => ({
      id: s.id,
      pin: s.pin,
      state: s.state,
      started_at: s.started_at,
      ended_at: s.ended_at,
      quiz_title: quizMap.get(s.quiz_id) ?? '',
      participant_count: countMap.get(s.id) ?? 0,
    }))
  );
});

gamesRouter.get('/:id', async (req: AuthRequest, res) => {
  const { data: session, error: sErr } = await supabaseAdmin
    .from('game_sessions')
    .select('id, quiz_id, pin, state, started_at, ended_at')
    .eq('id', req.params.id)
    .single();

  if (sErr || !session) { res.status(404).json({ error: 'Not found' }); return; }

  const { data: quiz, error: qErr } = await supabaseAdmin
    .from('quizzes')
    .select('id, title')
    .eq('id', session.quiz_id)
    .eq('host_id', req.userId!)
    .single();

  if (qErr || !quiz) { res.status(404).json({ error: 'Not found' }); return; }

  const { data: participants, error: participantsErr } = await supabaseAdmin
    .from('participants')
    .select('id, display_name, avatar_color, avatar_emoji, total_score')
    .eq('session_id', req.params.id)
    .order('total_score', { ascending: false });
  if (participantsErr) { res.status(500).json({ error: participantsErr.message }); return; }

  const { data: questions, error: questionsErr } = await supabaseAdmin
    .from('questions')
    .select('id, text, options, correct_index, order_index')
    .eq('quiz_id', session.quiz_id)
    .order('order_index');
  if (questionsErr) { res.status(500).json({ error: questionsErr.message }); return; }

  const participantIds = (participants ?? []).map((p) => p.id);
  let answers: { question_id: string; selected_index: number }[] = [];
  if (participantIds.length > 0) {
    const { data: aRows, error: aErr } = await supabaseAdmin
      .from('answers')
      .select('question_id, selected_index')
      .in('participant_id', participantIds);
    if (aErr) { res.status(500).json({ error: aErr.message }); return; }
    answers = aRows ?? [];
  }

  const answerMap = new Map<string, number[]>();
  for (const q of questions ?? []) {
    answerMap.set(q.id, new Array((q.options as string[]).length).fill(0));
  }
  for (const a of answers) {
    const counts = answerMap.get(a.question_id);
    if (counts && a.selected_index < counts.length) counts[a.selected_index]++;
  }

  res.json({
    session: {
      id: session.id,
      pin: session.pin,
      state: session.state,
      started_at: session.started_at,
      ended_at: session.ended_at,
      quiz_title: quiz.title,
    },
    participants: participants ?? [],
    questions: (questions ?? []).map((q) => ({
      ...q,
      answer_counts: answerMap.get(q.id) ?? [],
    })),
  });
});
