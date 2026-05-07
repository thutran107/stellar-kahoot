import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } }, error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'q-1', title: 'Test', host_id: 'user-1' }, error: null }),
    }),
  },
}));

describe('Quiz API', () => {
  it('GET /api/quizzes returns 401 without token', async () => {
    const { quizRouter } = await import('../routes/quiz.js');
    const app = express();
    app.use(express.json());
    app.use('/api/quizzes', quizRouter);
    const res = await request(app).get('/api/quizzes');
    expect(res.status).toBe(401);
  });

  it('GET /api/quizzes returns 200 with valid token', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const { quizRouter } = await import('../routes/quiz.js');
    const app = express();
    app.use(express.json());
    app.use('/api/quizzes', quizRouter);
    const res = await request(app)
      .get('/api/quizzes')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
  });
});
