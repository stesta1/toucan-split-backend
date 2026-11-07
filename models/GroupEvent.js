import mongoose from 'mongoose';

// Historial de todo lo que pasa en un split, para poder reconstruir paso a paso cómo se
// llegó a un estado (qué se cargó, quién lo hizo y cómo quedaron las deudas antes y después).
// Se guarda aparte del split, así sobrevive aunque el split se elimine.
const snapshotSchema = new mongoose.Schema({
  _id: false,
  balances: [{ _id: false, id: String, name: String, net: Number }], // + le deben / − debe
  debts: [{ _id: false, from: String, fromName: String, to: String, toName: String, amount: Number }],
}, { strict: false });

const groupEventSchema = new mongoose.Schema({
  groupId: { type: String, required: true },
  groupName: { type: String, default: null },
  type: {
    type: String,
    required: true,
    enum: [
      'group_created',
      'group_deleted',
      'members_added',
      'member_admin_changed',
      'expense_added',
      'expense_updated',
      'expense_deleted',
      'payment_added',
      'payment_rejected',
      'manual_fix', // corrección hecha a mano en la base (se inserta con un comando)
    ],
  },
  actor: { _id: false, id: String, name: String, isAdmin: Boolean }, // quién hizo la acción
  data: { type: mongoose.Schema.Types.Mixed, default: null },        // qué se pidió / qué cambió
  before: { type: snapshotSchema, default: null },                   // deudas antes de la acción
  after: { type: snapshotSchema, default: null },                    // deudas después
  createdAt: { type: Date, default: Date.now },
});

groupEventSchema.index({ groupId: 1, createdAt: 1 });

export default mongoose.model('GroupEvent', groupEventSchema);
