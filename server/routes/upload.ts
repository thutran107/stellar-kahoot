import { Router, Request, Response } from 'express';
import multer from 'multer';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

export const uploadRouter = Router();

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 10 * 1024 * 1024;

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

function runMulter(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.single('file')(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

uploadRouter.post('/question-image', requireAuth, async (req: AuthRequest, res) => {
  try {
    await runMulter(req, res);
  } catch (err: any) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'File too large — max 10 MB'
      : err.message || 'Upload error';
    res.status(400).json({ error: msg });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'No file provided' });
    return;
  }

  const questionId = req.body.questionId || 'misc';
  const timestamp = Date.now();
  const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `questions/${questionId}/${timestamp}-${safeName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from('question-images')
    .upload(path, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    res.status(500).json({ error: 'Storage upload failed' });
    return;
  }

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('question-images')
    .getPublicUrl(path);

  res.json({ url: publicUrl });
});

uploadRouter.delete('/question-image', requireAuth, async (req: AuthRequest, res) => {
  const { url } = req.body as { url?: string };
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url required' });
    return;
  }

  const base = `${process.env.SUPABASE_URL}/storage/v1/object/public/question-images/`;
  if (!url.startsWith(base)) {
    res.status(400).json({ error: 'Invalid storage URL' });
    return;
  }
  const storagePath = url.slice(base.length);

  const { error } = await supabaseAdmin.storage
    .from('question-images')
    .remove([storagePath]);

  if (error) {
    res.status(500).json({ error: 'Storage delete failed' });
    return;
  }

  res.status(204).send();
});
