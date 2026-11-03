import mongoose from 'mongoose';

const fromUserSchema = new mongoose.Schema({
  _id: false,
  id: { type: String, required: true },
  name: { type: String, required: true },
  avatarUrl: { type: String, default: null },
});

const notificationSchema = new mongoose.Schema({
  user: { type: String, required: true }, // id del User destinatario
  type: {
    type: String,
    required: true,
    enum: ['expense_added', 'payment_received', 'group_member_added', 'credit_card_due', 'friend_request', 'friend_accepted'],
  },
  message: { type: String, required: true },
  link: { type: String, default: null },
  fromUser: { type: fromUserSchema, default: null }, // quién generó la notificación
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ user: 1, createdAt: -1 });

notificationSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.user;
    return ret;
  },
});

export default mongoose.model('Notification', notificationSchema);
