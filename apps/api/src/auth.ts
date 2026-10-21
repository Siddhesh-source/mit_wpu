import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@plc/shared';
import { config } from './config.js';

export interface AuthUser {
  sub: string;
  roles: Role[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const signToken = (user: AuthUser) => jwt.sign(user, config.jwtSecret, { expiresIn: '12h' });

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Sign in required' });
  try {
    const { sub, roles } = jwt.verify(token, config.jwtSecret) as AuthUser;
    req.user = { sub, roles };
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, sign in again' });
  }
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.roles.some((r) => roles.includes(r))) return res.status(403).json({ error: 'Not allowed for your role' });
    next();
  };
