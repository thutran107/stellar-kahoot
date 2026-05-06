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
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    }),
  },
}));

describe('Games API', () => {
  it('GET /api/games returns 401 without token', async () => {
    const { gamesRouter } = await import('../routes/games.js');
    const app = express();
    app.use(express.json());
    app.use('/api/games', gamesRouter);
    const res = await request(app).get('/api/games');
    expect(res.status).toBe(401);
  });

  it('GET /api/games returns 200 with valid token', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const { gamesRouter } = await import('../routes/games.js');
    const app = express();
    app.use(express.json());
    app.use('/api/games', gamesRouter);
    const res = await request(app)
      .get('/api/games')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/games/:id returns 401 without token', async () => {
    const { gamesRouter } = await import('../routes/games.js');
    const app = express();
    app.use(express.json());
    app.use('/api/games', gamesRouter);
    const res = await request(app).get('/api/games/some-id');
    expect(res.status).toBe(401);
  });

  it('GET /api/games/:id returns 404 for missing session', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    });
    const { gamesRouter } = await import('../routes/games.js');
    const app = express();
    app.use(express.json());
    app.use('/api/games', gamesRouter);
    const res = await request(app)
      .get('/api/games/missing-id')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(404);
  });
});
