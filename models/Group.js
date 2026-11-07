import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema({
  description: { type: String, required: true },
  amount:      { type: Number, required: true },
  paidBy:      { type: String, required: true }, // member id (string)
  participants: [{ type: String }],              // array de member id strings
  createdBy:   { type: String, default: null },  // user id de quien lo cargó (null en gastos viejos)
  createdAt:   { type: Date, default: Date.now },
});

const paymentSchema = new mongoose.Schema({
  from:      { type: String, required: true }, // member id que salda su deuda
  to:        { type: String, required: true }, // member id que recibe el pago
  amount:    { type: Number, required: true },
  createdBy: { type: String, default: null }, // user id de quien lo registró (null en pagos viejos)
  createdAt: { type: Date, default: Date.now },
});

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  createdBy: { type: String, required: true },
  members: [{
    _id: false,
    id:            { type: String, required: true },
    name:          { type: String, required: true },
    username:      { type: String },
    avatarUrl:     { type: String, default: null },
    alias:         { type: String, default: null },
    isGroupAdmin:  { type: Boolean, default: false },
  }],
  expenses: [expenseSchema],
  payments: [paymentSchema],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Group', groupSchema);
