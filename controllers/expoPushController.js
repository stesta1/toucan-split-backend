import ExpoPushToken from '../models/ExpoPushToken.js';

export async function registerExpoToken(req, res) {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Falta el token' });
    await ExpoPushToken.findOneAndUpdate(
      { token },
      { user: req.user.id, token },
      { upsert: true, new: true }
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function unregisterExpoToken(req, res) {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Falta el token' });
    await ExpoPushToken.deleteOne({ token, user: req.user.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
