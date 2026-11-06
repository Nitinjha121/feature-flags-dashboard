import type { RequestHandler } from 'express';
import { actorSchema } from '@ff/shared';
import { AppError } from './errors';

/**
 * Who is making the change, taken from the X-Actor header.
 * Deliberate simplification: there is no authentication in this assignment. In production
 * the actor would come from the verified identity (e.g. the OIDC token's `sub`), never from
 * a client-controlled header. See docs/DECISIONS.md.
 */
export const requireActor: RequestHandler = (req, res, next) => {
  const parsed = actorSchema.safeParse(req.header('x-actor'));
  if (!parsed.success) {
    throw new AppError(400, 'ACTOR_REQUIRED', 'X-Actor header is required (1-100 characters)');
  }
  res.locals.actor = parsed.data;
  next();
};
