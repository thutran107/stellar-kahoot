import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

export const quizRouter = Router();

quizRouter.get('/:id/public', async (req, res) => {
  const { data: quiz, error } = await supabaseAdmin
    .from('quizzes')
    .select('id, title, description')
    .eq('id', req.params.id)
    .eq('is_ready', true)
    .single();
  if (error || !quiz) { res.status(404).json({ error: 'Not found' }); return; }

  const { data: questions } = await supabaseAdmin
    .from('questions')
    .select('id, text, options, correct_index, time_limit_sec, point_multiplier, image_url, topic, order_index')
    .eq('quiz_id', req.params.id)
    .order('order_index');

  res.json({ ...quiz, questions: questions || [] });
});

quizRouter.use(requireAuth);

quizRouter.get('/', async (req: AuthRequest, res) => {
  const { data, error } = await supabaseAdmin
    .from('quizzes')
    .select('id, title, description, is_ready, created_at')
    .eq('host_id', req.userId!)
    .order('created_at', { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

quizRouter.post('/', async (req: AuthRequest, res) => {
  const { title, description } = req.body;
  if (!title?.trim()) { res.status(400).json({ error: 'title required' }); return; }
  const { data, error } = await supabaseAdmin
    .from('quizzes')
    .insert({ host_id: req.userId!, title: title.trim(), description: description?.trim() || null })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

quizRouter.get('/:id', async (req: AuthRequest, res) => {
  const { data: quiz, error } = await supabaseAdmin
    .from('quizzes')
    .select('*')
    .eq('id', req.params.id)
    .eq('host_id', req.userId!)
    .single();
  if (error || !quiz) { res.status(404).json({ error: 'Not found' }); return; }
  const { data: questions } = await supabaseAdmin
    .from('questions')
    .select('*')
    .eq('quiz_id', req.params.id)
    .order('order_index');
  res.json({ ...quiz, questions: questions || [] });
});

quizRouter.patch('/:id', async (req: AuthRequest, res) => {
  const { title, description, is_ready } = req.body;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (is_ready !== undefined) updates.is_ready = is_ready;
  const { data, error } = await supabaseAdmin
    .from('quizzes')
    .update(updates)
    .eq('id', req.params.id)
    .eq('host_id', req.userId!)
    .select()
    .single();
  if (error || !data) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(data);
});

quizRouter.delete('/:id', async (req: AuthRequest, res) => {
  const { error } = await supabaseAdmin
    .from('quizzes')
    .delete()
    .eq('id', req.params.id)
    .eq('host_id', req.userId!);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

quizRouter.post('/:id/duplicate', async (req: AuthRequest, res) => {
  const { data: source, error: srcErr } = await supabaseAdmin
    .from('quizzes')
    .select('*')
    .eq('id', req.params.id)
    .eq('host_id', req.userId!)
    .single();
  if (srcErr || !source) { res.status(404).json({ error: 'Not found' }); return; }
  const { data: newQuiz, error: newErr } = await supabaseAdmin
    .from('quizzes')
    .insert({ host_id: req.userId!, title: `${source.title} (copy)`, description: source.description, is_ready: false })
    .select()
    .single();
  if (newErr || !newQuiz) { res.status(500).json({ error: 'Duplicate failed' }); return; }
  const { data: qs } = await supabaseAdmin
    .from('questions').select('*').eq('quiz_id', req.params.id).order('order_index');
  if (qs?.length) {
    await supabaseAdmin.from('questions').insert(
      qs.map(({ id: _id, quiz_id: _qid, ...q }) => ({ ...q, quiz_id: newQuiz.id }))
    );
  }
  res.status(201).json(newQuiz);
});

quizRouter.post('/:id/questions', async (req: AuthRequest, res) => {
  const { text, options, correct_index, time_limit_sec, point_multiplier, order_index, topic } = req.body;
  if (!options || correct_index === undefined) {
    res.status(400).json({ error: 'options and correct_index required' }); return;
  }
  const { data, error } = await supabaseAdmin
    .from('questions')
    .insert({
      quiz_id: req.params.id,
      text: text || '',
      options,
      correct_index,
      time_limit_sec: time_limit_sec || 20,
      point_multiplier: point_multiplier || 1,
      order_index: order_index ?? 0,
      topic: topic ?? null,
    })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

quizRouter.put('/:id/questions/reorder', async (req: AuthRequest, res) => {
  const { orderedIds }: { orderedIds: string[] } = req.body;
  if (!Array.isArray(orderedIds)) {
    res.status(400).json({ error: 'orderedIds array required' }); return;
  }
  await Promise.all(
    orderedIds.map((qId, idx) =>
      supabaseAdmin.from('questions').update({ order_index: idx }).eq('id', qId)
    )
  );
  res.status(204).send();
});

quizRouter.patch('/questions/:qid', async (req: AuthRequest, res) => {
  const allowed = ['text', 'options', 'correct_index', 'time_limit_sec', 'point_multiplier', 'image_url', 'topic'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  const { data, error } = await supabaseAdmin
    .from('questions')
    .update(updates)
    .eq('id', req.params.qid)
    .select()
    .single();
  if (error || !data) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(data);
});

quizRouter.delete('/questions/:qid', async (req: AuthRequest, res) => {
  const { error } = await supabaseAdmin
    .from('questions')
    .delete()
    .eq('id', req.params.qid);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});
