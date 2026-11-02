import mongoose from 'mongoose';

export const CREDIT_CARD_COLORS = ['blue', 'orange', 'gray', 'green', 'purple', 'red', 'teal'];

const creditCardSchema = new mongoose.Schema({
  user: { type: String, required: true }, // id del User dueño — privada, no se comparte
  name: { type: String, required: true, trim: true },
  colorKey: { type: String, required: true, enum: CREDIT_CARD_COLORS },
  closingDay: { type: Number, required: true, min: 1, max: 31 }, // día del mes, recurrente
  createdAt: { type: Date, default: Date.now },
});

creditCardSchema.index({ user: 1 });

export default mongoose.model('CreditCard', creditCardSchema);
