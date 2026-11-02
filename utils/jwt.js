import jwt from 'jsonwebtoken';

const EXPIRES_IN = '30d';

export function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), username: user.username, name: user.name, isAdmin: user.isAdmin },
    process.env.JWT_SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}
