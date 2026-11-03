import 'dotenv/config';
import bcrypt from 'bcryptjs';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import groupsRouter from './routes/groups.js';
import quickSplitsRouter from './routes/quickSplits.js';
import notificationsRouter from './routes/notifications.js';
import friendsRouter from './routes/friends.js';
import pushRouter from './routes/push.js';
import creditCardsRouter from './routes/creditCards.js';
import adminRouter from './routes/admin.js';
import { requireAuth, requireAdmin } from './middleware/auth.js';
import User from './models/User.js';
import { startCreditCardReminders } from './jobs/creditCardReminders.js';

const app  = express();
const PORT = process.env.PORT || 291;

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.use('/api/auth',   authRouter);
app.use('/api/users',  usersRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/quick-splits', quickSplitsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/push', pushRouter);
app.use('/api/credit-cards', creditCardsRouter);
app.use('/api/admin',  requireAuth, requireAdmin, adminRouter);

// Health check para el hosting: 200 si la API está arriba y conectada a Mongo, 503 si no.
function health(req, res) {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({
    ok: dbConnected,
    db: dbConnected ? 'connected' : 'disconnected',
    uptime: Math.round(process.uptime()),
  });
}
app.get('/health', health);
app.get('/api/health', health);

// El frontend vive en su propia app (Front/), acá solo se sirve la API.
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

async function ensureAdmin() {
  const exists = await User.findOne({ isAdmin: true });
  if (!exists) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
    await User.create({
      username: process.env.ADMIN_USERNAME || 'admin',
      password: hash,
      name: process.env.ADMIN_NAME || 'Admin',
      isAdmin: true,
    });
    console.log(`Usuario admin creado automáticamente (username: ${process.env.ADMIN_USERNAME || 'admin'})`);
  }
}

// Los usuarios creados desde el admin sin mail tenían un mail de relleno con la marca
// vieja (@sin-email.tarugoapp.local). Se pasa a la nueva; si no queda ninguno, no hace nada.
async function renameLegacyPlaceholderEmails() {
  const OLD_DOMAIN = '@sin-email.tarugoapp.local';
  const users = await User.find({ email: /@sin-email\.tarugoapp\.local$/ });
  for (const u of users) {
    u.email = u.email.replace(OLD_DOMAIN, '@sin-email.toucansplit.local');
    await u.save();
  }
  if (users.length) console.log(`Mails de relleno renombrados a la marca nueva: ${users.length}`);
}

if (!process.env.MONGO_DB_URL) {
  console.error('Falta la variable de entorno MONGO_DB_URL (cadena de conexión a Mongo)');
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_DB_URL)
  .then(async () => {
    console.log('Conectado a MongoDB');
    await ensureAdmin();
    await renameLegacyPlaceholderEmails().catch((e) => console.error('No se pudieron renombrar los mails de relleno:', e.message));
    startCreditCardReminders();
    app.listen(PORT, () => console.log(`Backend corriendo en http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Error conectando a MongoDB:', err.message);
    process.exit(1);
  });
