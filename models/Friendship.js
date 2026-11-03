import mongoose from 'mongoose';

// Amistad entre dos usuarios. Arranca como solicitud (pending) del requester
// al recipient y pasa a accepted cuando el recipient la acepta.
const friendshipSchema = new mongoose.Schema({
  requester: { type: String, required: true }, // id del User que mandó la solicitud
  recipient: { type: String, required: true }, // id del User que tiene que aceptarla
  pair: { type: String, required: true, unique: true }, // ids ordenados "a:b", evita duplicados en ambos sentidos
  status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  acceptedAt: { type: Date, default: null },
});

friendshipSchema.index({ requester: 1, status: 1 });
friendshipSchema.index({ recipient: 1, status: 1 });

export function pairKey(a, b) {
  return [a, b].sort().join(':');
}

export default mongoose.model('Friendship', friendshipSchema);
