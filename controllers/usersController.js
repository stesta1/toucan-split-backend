import User from '../models/User.js';

export async function getUsers(req, res) {
  try {
    const users = await User.find().sort({ name: 1 });
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
