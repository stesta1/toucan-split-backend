const isProd = process.env.NODE_ENV === 'production';

export const COOKIE_NAME = 'token';

export const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días, igual que el JWT
};
