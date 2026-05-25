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

  it('GET /api/quizzes/:id/public returns 200 without token when quiz is ready', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    let callCount = 0;
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // quizzes query
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'quiz-1', title: 'Space Quiz', description: null },
            error: null,
          }),
        };
      }
      // questions query
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });
    const { quizRouter } = await import('../routes/quiz.js');
    const app = express();
    app.use(express.json());
    app.use('/api/quizzes', quizRouter);
    const res = await request(app).get('/api/quizzes/quiz-1/public');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('title', 'Space Quiz');
    expect(res.body).toHaveProperty('questions');
    expect(res.body).not.toHaveProperty('host_id');
  });

  it('GET /api/quizzes/:id/public returns 404 when quiz is draft (is_ready = false)', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    });
    const { quizRouter } = await import('../routes/quiz.js');
    const app = express();
    app.use(express.json());
    app.use('/api/quizzes', quizRouter);
    const res = await request(app).get('/api/quizzes/draft-quiz/public');
    expect(res.status).toBe(404);
  });

  it('GET /api/quizzes/:id/public does not expose host_id', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    vi.resetModules();
    let callCount = 0;
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            // host_id is deliberately included in the mock return to prove the endpoint strips it
            data: { id: 'quiz-1', title: 'Space Quiz', description: null, host_id: 'owner-user-id' },
            error: null,
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });
    const { quizRouter } = await import('../routes/quiz.js');
    const app = express();
    app.use(express.json());
    app.use('/api/quizzes', quizRouter);
    const res = await request(app).get('/api/quizzes/quiz-1/public');
    expect(res.body).not.toHaveProperty('host_id');
  });
});
