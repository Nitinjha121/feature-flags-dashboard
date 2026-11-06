import { Router } from 'express';
import { z } from 'zod';
import { listFlagsQuerySchema, updateFlagSchema } from '@ff/shared';
import type { Db } from '../../db/client';
import { requireActor } from '../../http/actor';
import { AppError } from '../../http/errors';
import { createFlag, listFlags, setFlagEnabled } from './flags.service';

// z.guid() accepts any 8-4-4-4-12 hex id; z.uuid() would also enforce RFC version bits.
const idParamSchema = z.guid();

export function flagsRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = listFlagsQuerySchema.parse(req.query);
    res.json({ data: await listFlags(db, query) });
  });

  router.post('/', requireActor, async (req, res) => {
    const flag = await createFlag(db, req.body, res.locals.actor as string);
    res.status(201).json({ data: flag });
  });

  router.patch('/:id', requireActor, async (req, res) => {
    const id = idParamSchema.safeParse(req.params.id);
    if (!id.success) throw new AppError(404, 'FLAG_NOT_FOUND', 'Flag not found');
    const { enabled } = updateFlagSchema.parse(req.body);
    const result = await setFlagEnabled(db, id.data, enabled, res.locals.actor as string);
    res.json({ data: result.flag, meta: { changed: result.changed } });
  });

  return router;
}
