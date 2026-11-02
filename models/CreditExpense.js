import mongoose from 'mongoose';

const participantSchema = new mongoose.Schema({
  _id: false,
  id: { type: String, required: true },
  name: { type: String, required: true, trim: true },
});

// Marca que un participante pagó una cuota puntual — se usa para el check
// mes a mes; cuando todos los participantes (menos el dueño) pagaron todas
// las cuotas, el gasto queda "settled" y deja de mostrarse.
const paymentSchema = new mongoose.Schema({
  _id: false,
  participantId: { type: String, required: true },
  installment: { type: Number, required: true },
});

// Gasto en cuotas de una tarjeta, dividido entre gente que no necesariamente
// tiene cuenta (mismo patrón que QuickSplit) — el dueño de la tarjeta es
// quien la paga, estos participantes son a quienes les tiene que cobrar.
const creditExpenseSchema = new mongoose.Schema({
  card: { type: mongoose.Schema.Types.ObjectId, ref: 'CreditCard', required: true },
  description: { type: String, required: true, trim: true },
  totalAmount: { type: Number, required: true },
  installments: { type: Number, required: true, min: 1 },
  participants: [participantSchema],
  payments: { type: [paymentSchema], default: [] },
  settled: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

creditExpenseSchema.index({ card: 1 });

export default mongoose.model('CreditExpense', creditExpenseSchema);
