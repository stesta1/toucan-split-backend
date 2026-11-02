import cron from 'node-cron';
import CreditCard from '../models/CreditCard.js';
import CreditExpense from '../models/CreditExpense.js';
import CreditCardReminderState from '../models/CreditCardReminderState.js';
import { notifyUsers } from '../utils/notify.js';
import { currentInstallmentNumber, isInstallmentActive, debtorsOf, isInstallmentPaid } from '../utils/creditCardInstallments.js';

function buildDueMessage(cardName, owedByName) {
  const entries = Array.from(owedByName.entries()); // [[name, monto], ...]
  const distinctAmounts = new Set(entries.map(([, amount]) => amount.toFixed(2)));

  if (distinctAmounts.size === 1) {
    // Todos deben el mismo monto — lo mostramos una sola vez, no la suma.
    const names = entries.map(([name]) => name);
    const namesList =
      names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} y ${names.length - 2} más`;
    const verb = names.length === 1 ? 'te debe' : 'te deben';
    return `Tu tarjeta "${cardName}" cierra hoy — ${namesList} ${verb} $${entries[0][1].toFixed(2)}`;
  }

  if (entries.length <= 3) {
    // Pocos deudores con montos distintos: los detallamos uno por uno.
    const parts = entries.map(([name, amount]) => `${name} $${amount.toFixed(2)}`);
    return `Tu tarjeta "${cardName}" cierra hoy — ${parts.join(', ')}`;
  }

  const total = entries.reduce((sum, [, amount]) => sum + amount, 0);
  return `Tu tarjeta "${cardName}" cierra hoy — ${entries.length} personas te deben un total de $${total.toFixed(2)}`;
}

// Manda el recordatorio de cada tarjeta que tenga cuotas activas hoy — la
// usan tanto el cron diario (con las tarjetas que cierran hoy) como el
// endpoint de test manual (con las tarjetas que se le pasen, sin importar
// el día de cierre). El monto y los nombres son sobre quienes todavía NO
// pagaron la cuota de este mes, no sobre el total de la tarjeta.
export async function sendReminderForCards(cards, today = new Date()) {
  let sent = 0;
  for (const card of cards) {
    const expenses = await CreditExpense.find({ card: card._id });
    const active = expenses.filter((e) => isInstallmentActive(e, today));
    if (active.length === 0) continue;

    const owedByName = new Map();
    for (const expense of active) {
      const perPerson = expense.totalAmount / expense.installments / (expense.participants.length || 1);
      const installment = currentInstallmentNumber(expense, today);
      const unpaidDebtors = debtorsOf(expense, card.user).filter(
        (d) => !isInstallmentPaid(expense, d.id, installment)
      );
      for (const debtor of unpaidDebtors) {
        owedByName.set(debtor.name, (owedByName.get(debtor.name) ?? 0) + perPerson);
      }
    }
    if (owedByName.size === 0) continue; // ya está todo cobrado este mes

    await notifyUsers([card.user], null, {
      type: 'credit_card_due',
      message: buildDueMessage(card.name, owedByName),
      link: `/creditos/${card._id.toString()}`,
    });
    sent++;
  }
  return sent;
}

function lastDayOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function dateKey(date) {
  // Hora local del server, no UTC — para que coincida con getDate()/getMonth()
  // que se usan en el resto del chequeo.
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

async function checkCardsClosingToday() {
  const today = new Date();
  const todayDate = today.getDate();
  const isLastDayOfMonth = todayDate === lastDayOfMonth(today);

  // Si hoy es el último día del mes, también entran las tarjetas cuyo día de
  // cierre es mayor (ej: 31 en febrero o abril) — cierran el último día que
  // exista, como en una tarjeta real.
  const query = isLastDayOfMonth ? { closingDay: { $gte: todayDate } } : { closingDay: todayDate };
  const cards = await CreditCard.find(query);
  await sendReminderForCards(cards, today);
}

// Idempotente por día: si ya corrió hoy, no hace nada. Se llama tanto al
// arrancar el server (por si estuvo caído justo a las 9am y se perdió el
// cron de ese día) como desde el cron diario — entre las dos garantizan que
// el chequeo de "hoy" corra una sola vez, pase lo que pase con reinicios.
async function runIfNeeded() {
  const key = dateKey(new Date());
  const state = await CreditCardReminderState.findByIdAndUpdate(
    'singleton',
    { $setOnInsert: { lastRunDate: null } },
    { upsert: true, new: true }
  );
  if (state.lastRunDate === key) return;

  await checkCardsClosingToday();
  await CreditCardReminderState.updateOne({ _id: 'singleton' }, { lastRunDate: key });
}

// Corre al arrancar el server y todos los días a las 9am (hora del server).
export function startCreditCardReminders() {
  runIfNeeded().catch((e) => console.log('[credit-card-reminders] error en el chequeo inicial:', e.message));
  cron.schedule('0 9 * * *', () => {
    runIfNeeded().catch((e) => console.log('[credit-card-reminders] error:', e.message));
  });
}
