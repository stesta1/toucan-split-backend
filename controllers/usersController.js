import User from '../models/User.js';
import { friendIdsOf } from '../utils/friends.js';

// Usuarios que el logueado puede sumar a un split: sus amigos (el admin ve a todos).
export async function getUsers(req, res) {
  try {
    const filter = req.user.isAdmin ? {} : { _id: { $in: await friendIdsOf(req.user.id) } };
    const users = await User.find(filter).sort({ name: 1 });
    res.json(users.map((u) => ({
      id: u._id.toString(),
      name: u.name,
      username: u.username,
      avatarUrl: u.avatarUrl,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
