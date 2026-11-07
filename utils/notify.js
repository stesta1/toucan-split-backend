import Notification from '../models/Notification.js';
import { sendPushToUsers, sendExpoPushToUsers } from './push.js';
import { publish } from './live.js';

const PUSH_TITLES = {
  expense_added: 'Nuevo gasto',
  payment_received: 'Pago recibido',
  payment_confirmed: 'Pago registrado',
  group_member_added: 'Te agregaron a un split',
  credit_card_due: 'Vencimiento de tarjeta',
  friend_request: 'Solicitud de amistad',
  friend_accepted: 'Nuevo amigo',
};

// Crea una notificación para cada userId de la lista, salvo el que generó la acción,
// y le manda un push best-effort a quien tenga notificaciones push activadas.
export async function notifyUsers(userIds, actorId, { type, message, link = null, fromUser = null }) {
  const recipients = Array.from(new Set(userIds)).filter((id) => id && id !== actorId);
  if (recipients.length === 0) return;

  await Notification.insertMany(
    recipients.map((user) => ({ user, type, message, link, fromUser }))
  );
  publish(recipients, 'notification', { type });

  const pushPayload = {
    title: PUSH_TITLES[type] || 'Toucan Split',
    body: message,
    url: link,
  };
  sendPushToUsers(recipients, pushPayload).catch(() => {});
  sendExpoPushToUsers(recipients, pushPayload).catch(() => {});
}
