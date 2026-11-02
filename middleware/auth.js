import { verifyToken } from '../utils/jwt.js';

export function requireAuth(req, res, next) {
  // La app web se autentica con la cookie httpOnly; la app mobile (Expo) no
  // maneja cookies de forma confiable, así que manda el JWT como Bearer token.
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const token = req.cookies?.token || bearer;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = verifyToken(token);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Requiere permisos de administrador' });
  next();
}
