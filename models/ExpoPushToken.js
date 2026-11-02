import mongoose from 'mongoose';

const expoPushTokenSchema = new mongoose.Schema({
  user: { type: String, required: true },
  token: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
});

expoPushTokenSchema.index({ user: 1 });

export default mongoose.model('ExpoPushToken', expoPushTokenSchema);
