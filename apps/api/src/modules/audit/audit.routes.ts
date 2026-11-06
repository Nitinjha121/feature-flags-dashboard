import { Router } from 'express';
import { desc } from 'drizzle-orm';
import { listAuditLogsQuerySchema } from '@ff/shared';
import type { Db } from '../../db/client';
import { auditLogs } from '../../db/schema';

export function auditRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { limit } = listAuditLogsQuerySchema.parse(req.query);
    const entries = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(limit);
    res.json({ data: entries });
  });

  return router;
}
