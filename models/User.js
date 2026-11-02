import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, default: null, trim: true, lowercase: true, unique: true, sparse: true },
  avatarUrl: { type: String, default: null },
  alias: { type: String, default: null },
  isAdmin: { type: Boolean, default: false },
  dismissedHints: { type: [String], default: [] }, // hints de UI descartados permanentemente ("no volver a mostrar")
  createdAt: { type: Date, default: Date.now },
});

userSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.password;
    return ret;
  },
});

export default mongoose.model('User', userSchema);
