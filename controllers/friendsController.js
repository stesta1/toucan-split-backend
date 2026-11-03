import Friendship, { pairKey } from '../models/Friendship.js';
import User from '../models/User.js';
import { notifyUsers } from '../utils/notify.js';

function publicUser(u) {
  return {
    id: u._id.toString(),
    name: u.name,
    username: u.username,
    avatarUrl: u.avatarUrl,
  };
}

function fromUser(req, me) {
  return { id: req.user.id, name: me?.name || req.user.name, avatarUrl: me?.avatarUrl || null };
}

// Estado de la relación entre el usuario logueado y otro, visto desde el logueado.
function relationStatus(friendship, myId) {
  if (!friendship) return 'none';
  if (friendship.status === 'accepted') return 'friends';
  return friendship.requester === myId ? 'outgoing' : 'incoming';
}

async function usersById(ids) {
  const users = await User.find({ _id: { $in: ids } });
  return new Map(users.map((u) => [u._id.toString(), publicUser(u)]));
}

// Amigos + solicitudes recibidas y enviadas del usuario logueado.
export async function getFriends(req, res) {
  try {
    const myId = req.user.id;
    const friendships = await Friendship.find({ $or: [{ requester: myId }, { recipient: myId }] })
      .sort({ createdAt: -1 });
    const otherId = (f) => (f.requester === myId ? f.recipient : f.requester);
    const users = await usersById(friendships.map(otherId));

    const friends = [];
    const incoming = [];
    const outgoing = [];
    for (const f of friendships) {
      const user = users.get(otherId(f));
      if (!user) continue; // el otro usuario fue eliminado
      const status = relationStatus(f, myId);
      if (status === 'friends') friends.push({ ...user, since: f.acceptedAt });
      else (status === 'incoming' ? incoming : outgoing).push({ id: f._id.toString(), user, createdAt: f.createdAt });
    }
    friends.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    res.json({ friends, incoming, outgoing });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Busca un usuario por su username exacto (para el buscador y el link/QR de invitación).
export async function lookupUser(req, res) {
  try {
    const username = String(req.params.username || '').trim().toLowerCase().replace(/^@/, '');
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'No encontramos a nadie con ese usuario' });

    const id = user._id.toString();
    if (id === req.user.id) return res.json({ ...publicUser(user), status: 'self', requestId: null });

    const friendship = await Friendship.findOne({ pair: pairKey(req.user.id, id) });
    res.json({
      ...publicUser(user),
      status: relationStatus(friendship, req.user.id),
      requestId: friendship && friendship.status === 'pending' ? friendship._id.toString() : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Manda una solicitud de amistad. Si el otro ya te había mandado una, quedan como amigos.
export async function sendRequest(req, res) {
  try {
    const username = String(req.body.username || '').trim().toLowerCase().replace(/^@/, '');
    if (!username) return res.status(400).json({ error: 'Ingresá un usuario' });
    const target = await User.findOne({ username });
    if (!target) return res.status(404).json({ error: 'No encontramos a nadie con ese usuario' });

    const myId = req.user.id;
    const targetId = target._id.toString();
    if (targetId === myId) return res.status(400).json({ error: 'No podés agregarte a vos mismo' });

    const me = await User.findById(myId);
    const existing = await Friendship.findOne({ pair: pairKey(myId, targetId) });

    if (existing?.status === 'accepted') return res.status(400).json({ error: 'Ya son amigos' });
    if (existing?.requester === myId) return res.status(400).json({ error: 'Ya le mandaste una solicitud' });

    if (existing) {
      // Te había mandado una solicitud: mandarle una vos equivale a aceptarla.
      existing.status = 'accepted';
      existing.acceptedAt = new Date();
      await existing.save();
      await notifyUsers([targetId], myId, {
        type: 'friend_accepted',
        message: `${me?.name || req.user.name} aceptó tu solicitud de amistad`,
        link: '/amigos',
        fromUser: fromUser(req, me),
      });
      return res.status(201).json({ ...publicUser(target), status: 'friends', requestId: null });
    }

    const friendship = await Friendship.create({
      requester: myId,
      recipient: targetId,
      pair: pairKey(myId, targetId),
    });
    await notifyUsers([targetId], myId, {
      type: 'friend_request',
      message: `${me?.name || req.user.name} quiere ser tu amigo en Toucan Split`,
      link: '/amigos',
      fromUser: fromUser(req, me),
    });
    res.status(201).json({ ...publicUser(target), status: 'outgoing', requestId: friendship._id.toString() });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: 'Ya existe una solicitud entre ustedes' });
    res.status(500).json({ error: e.message });
  }
}

export async function acceptRequest(req, res) {
  try {
    const friendship = await Friendship.findById(req.params.id);
    if (!friendship || friendship.status !== 'pending' || friendship.recipient !== req.user.id) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }
    friendship.status = 'accepted';
    friendship.acceptedAt = new Date();
    await friendship.save();

    const me = await User.findById(req.user.id);
    await notifyUsers([friendship.requester], req.user.id, {
      type: 'friend_accepted',
      message: `${me?.name || req.user.name} aceptó tu solicitud de amistad`,
      link: '/amigos',
      fromUser: fromUser(req, me),
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Rechazar (si te la mandaron) o cancelar (si la mandaste vos) una solicitud pendiente.
export async function deleteRequest(req, res) {
  try {
    const friendship = await Friendship.findById(req.params.id);
    const myId = req.user.id;
    if (!friendship || friendship.status !== 'pending'
      || (friendship.recipient !== myId && friendship.requester !== myId)) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }
    await friendship.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Dejar de ser amigos. No toca los splits que ya comparten.
export async function removeFriend(req, res) {
  try {
    const result = await Friendship.deleteOne({
      pair: pairKey(req.user.id, req.params.userId),
      status: 'accepted',
    });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'No son amigos' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
