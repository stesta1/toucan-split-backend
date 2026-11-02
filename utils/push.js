import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';
import ExpoPushToken from '../models/ExpoPushToken.js';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  configured = true;
}

// Best-effort: manda un push a cada suscripción de esos usuarios y borra las que ya no sirven.
export async function sendPushToUsers(userIds, payload) {
  const ids = Array.from(new Set(userIds)).filter(Boolean);
  if (ids.length === 0) return;
  ensureConfigured();

  const subs = await PushSubscription.find({ user: { $in: ids } });
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload)
        );
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
        }
      }
    })
  );
}

// Best-effort: manda un push a cada token de Expo de esos usuarios (app mobile)
// y borra los que Expo reporta como definitivamente inválidos.
export async function sendExpoPushToUsers(userIds, { title, body, url }) {
  const ids = Array.from(new Set(userIds)).filter(Boolean);
  if (ids.length === 0) return;

  const tokens = await ExpoPushToken.find({ user: { $in: ids } });
  console.log(`[expo-push] ${tokens.length} token(s) para ${ids.length} usuario(s): "${title}" — ${body}`);
  if (tokens.length === 0) return;

  const messages = tokens.map((t) => ({
    to: t.token,
    title,
    body,
    data: { url },
  }));

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    const result = await res.json();
    console.log('[expo-push] respuesta de Expo:', JSON.stringify(result));
    const invalidTokens = (result.data || [])
      .map((r, i) => (r.status === 'error' && r.details?.error === 'DeviceNotRegistered' ? messages[i].to : null))
      .filter(Boolean);
    if (invalidTokens.length > 0) {
      await ExpoPushToken.deleteMany({ token: { $in: invalidTokens } });
    }
  } catch (e) {
    console.log('[expo-push] error mandando push:', e.message);
  }
}
