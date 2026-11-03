import Friendship from '../models/Friendship.js';

// Ids de los amigos (amistades aceptadas) de un usuario.
export async function friendIdsOf(userId) {
  const friendships = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: userId }, { recipient: userId }],
  });
  return friendships.map((f) => (f.requester === userId ? f.recipient : f.requester));
}

// Devuelve los ids de la lista que NO son amigos de userId (ignora al propio userId).
export async function nonFriendIds(userId, ids) {
  const friends = new Set(await friendIdsOf(userId));
  return ids.filter((id) => id !== userId && !friends.has(id));
}
