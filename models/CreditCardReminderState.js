import mongoose from 'mongoose';

// Documento único que trackea el último día (YYYY-MM-DD, hora del server)
// en el que corrió el chequeo de recordatorios — permite que, si el server
// estuvo caído justo a las 9am, el chequeo de "hoy" se dispare apenas
// vuelve a levantar en vez de perderse hasta el día siguiente.
const stateSchema = new mongoose.Schema({
  _id: { type: String, default: 'singleton' },
  lastRunDate: { type: String, default: null },
});

export default mongoose.model('CreditCardReminderState', stateSchema);
