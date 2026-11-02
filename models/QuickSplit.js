import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema({
  _id: false,
  id:   { type: String, required: true },
  name: { type: String, required: true, trim: true },
});

const expenseSchema = new mongoose.Schema({
  _id: false,
  description:  { type: String, required: true, trim: true },
  amount:       { type: Number, required: true },
  paidBy:       { type: String, required: true },  // member id
  participants: [{ type: String, required: true }], // member ids
});

// Split de una sola vez con integrantes que no son usuarios de la app.
// Se crea completo de un saque y queda inmutable — no hay edición ni pagos.
const quickSplitSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  createdBy: { type: String, required: true }, // id del User que lo creó
  shareCode: { type: String, required: true, unique: true }, // id corto para el link público
  members:   [memberSchema],
  expenses:  [expenseSchema],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('QuickSplit', quickSplitSchema);
