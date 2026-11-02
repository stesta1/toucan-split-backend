import Member from '../models/Member.js';

export async function getMembers(req, res) {
  try {
    const members = await Member.find().sort({ name: 1 });
    res.json(members.map((m) => m.toJSON()));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
