import CreditCard, { CREDIT_CARD_COLORS } from '../models/CreditCard.js';
import CreditExpense from '../models/CreditExpense.js';
import { sendReminderForCards } from '../jobs/creditCardReminders.js';
import { currentInstallmentNumber, isInstallmentActive, computeSettled } from '../utils/creditCardInstallments.js';

function serializeExpense(e) {
  const perInstallment = e.totalAmount / e.installments;
  return {
    id: e._id.toString(),
    description: e.description,
    totalAmount: e.totalAmount,
    installments: e.installments,
    perInstallment,
    perPersonPerInstallment: perInstallment / (e.participants.length || 1),
    participants: e.participants,
    payments: e.payments,
    settled: e.settled,
    currentInstallment: currentInstallmentNumber(e),
    isActive: isInstallmentActive(e),
    createdAt: e.createdAt,
  };
}

async function activeMonthlySummary(cardId) {
  const expenses = await CreditExpense.find({ card: cardId, settled: { $ne: true } });
  let total = 0;
  for (const e of expenses) {
    if (isInstallmentActive(e)) total += e.totalAmount / e.installments;
  }
  return { activeMonthlyTotal: total, expenseCount: expenses.length };
}

function serializeCard(card, summary) {
  return {
    id: card._id.toString(),
    name: card.name,
    colorKey: card.colorKey,
    closingDay: card.closingDay,
    activeMonthlyTotal: summary.activeMonthlyTotal,
    expenseCount: summary.expenseCount,
    createdAt: card.createdAt,
  };
}

export async function getCreditCards(req, res) {
  try {
    const cards = await CreditCard.find({ user: req.user.id }).sort({ createdAt: -1 });
    const result = await Promise.all(
      cards.map(async (c) => serializeCard(c, await activeMonthlySummary(c._id)))
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function createCreditCard(req, res) {
  try {
    const { name, colorKey, closingDay } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'El nombre es requerido' });
    if (!CREDIT_CARD_COLORS.includes(colorKey)) return res.status(400).json({ error: 'Color inválido' });
    const day = parseInt(closingDay, 10);
    if (!day || day < 1 || day > 31) return res.status(400).json({ error: 'Día de cierre inválido' });

    const card = await CreditCard.create({ user: req.user.id, name: name.trim(), colorKey, closingDay: day });
    res.status(201).json(serializeCard(card, { activeMonthlyTotal: 0, expenseCount: 0 }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function getCreditCard(req, res) {
  try {
    const card = await CreditCard.findById(req.params.id);
    if (!card) return res.status(404).json({ error: 'Tarjeta no encontrada' });
    if (card.user !== req.user.id) return res.status(403).json({ error: 'No podés ver esta tarjeta' });

    const expenses = await CreditExpense.find({ card: card._id, settled: { $ne: true } }).sort({ createdAt: -1 });
    const summary = await activeMonthlySummary(card._id);
    res.json({ ...serializeCard(card, summary), expenses: expenses.map(serializeExpense) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function updateCreditCard(req, res) {
  try {
    const card = await CreditCard.findById(req.params.id);
    if (!card) return res.status(404).json({ error: 'Tarjeta no encontrada' });
    if (card.user !== req.user.id) return res.status(403).json({ error: 'No podés editar esta tarjeta' });

    const { name, colorKey, closingDay } = req.body;
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'El nombre es requerido' });
      card.name = name.trim();
    }
    if (colorKey !== undefined) {
      if (!CREDIT_CARD_COLORS.includes(colorKey)) return res.status(400).json({ error: 'Color inválido' });
      card.colorKey = colorKey;
    }
    if (closingDay !== undefined) {
      const day = parseInt(closingDay, 10);
      if (!day || day < 1 || day > 31) return res.status(400).json({ error: 'Día de cierre inválido' });
      card.closingDay = day;
    }
    await card.save();
    res.json(serializeCard(card, await activeMonthlySummary(card._id)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function deleteCreditCard(req, res) {
  try {
    const card = await CreditCard.findById(req.params.id);
    if (!card) return res.status(404).json({ error: 'Tarjeta no encontrada' });
    if (card.user !== req.user.id) return res.status(403).json({ error: 'No podés eliminar esta tarjeta' });

    await CreditExpense.deleteMany({ card: card._id });
    await card.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function addCreditExpense(req, res) {
  try {
    const card = await CreditCard.findById(req.params.id);
    if (!card) return res.status(404).json({ error: 'Tarjeta no encontrada' });
    if (card.user !== req.user.id) return res.status(403).json({ error: 'No podés agregar gastos a esta tarjeta' });

    const { description, totalAmount, installments, participants } = req.body;
    if (!description?.trim()) return res.status(400).json({ error: 'La descripción es requerida' });
    const amount = parseFloat(totalAmount);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Ingresá un monto válido' });
    const n = parseInt(installments, 10) || 1;
    if (n < 1 || n > 60) return res.status(400).json({ error: 'Cantidad de cuotas inválida (1 a 60)' });
    if (!Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ error: 'Cargá al menos un participante' });
    }

    const seenNames = new Set();
    for (const p of participants) {
      if (!p.name?.trim()) return res.status(400).json({ error: 'Todos los participantes necesitan un nombre' });
      const normalized = p.name.trim().toLowerCase();
      if (seenNames.has(normalized)) return res.status(400).json({ error: `El nombre "${p.name.trim()}" está repetido` });
      seenNames.add(normalized);
    }

    const expense = await CreditExpense.create({
      card: card._id,
      description: description.trim(),
      totalAmount: amount,
      installments: n,
      participants: participants.map((p, i) => ({ id: p.id || `p${i + 1}`, name: p.name.trim() })),
    });
    res.status(201).json(serializeExpense(expense));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function deleteCreditExpense(req, res) {
  try {
    const card = await CreditCard.findById(req.params.id);
    if (!card) return res.status(404).json({ error: 'Tarjeta no encontrada' });
    if (card.user !== req.user.id) return res.status(403).json({ error: 'No podés eliminar este gasto' });

    const expense = await CreditExpense.findOne({ _id: req.params.expenseId, card: card._id });
    if (!expense) return res.status(404).json({ error: 'Gasto no encontrado' });
    await expense.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Marca (o desmarca) que un participante pagó una cuota puntual. Cuando
// todos los participantes (menos el dueño) pagaron todas las cuotas, el
// gasto queda liquidado y desaparece de los listados.
export async function setExpensePayment(req, res) {
  try {
    const card = await CreditCard.findById(req.params.id);
    if (!card) return res.status(404).json({ error: 'Tarjeta no encontrada' });
    if (card.user !== req.user.id) return res.status(403).json({ error: 'No podés editar este gasto' });

    const expense = await CreditExpense.findOne({ _id: req.params.expenseId, card: card._id });
    if (!expense) return res.status(404).json({ error: 'Gasto no encontrado' });

    const { participantId, installment, paid } = req.body;
    const inst = parseInt(installment, 10);
    if (!participantId || !inst || inst < 1 || inst > expense.installments) {
      return res.status(400).json({ error: 'Datos de pago inválidos' });
    }
    if (participantId === card.user) {
      return res.status(400).json({ error: 'El dueño de la tarjeta no se debe a sí mismo' });
    }
    if (!expense.participants.some((p) => p.id === participantId)) {
      return res.status(400).json({ error: 'Ese participante no pertenece a este gasto' });
    }

    const exists = expense.payments.some((p) => p.participantId === participantId && p.installment === inst);
    if (paid && !exists) {
      expense.payments.push({ participantId, installment: inst });
    } else if (!paid && exists) {
      expense.payments = expense.payments.filter(
        (p) => !(p.participantId === participantId && p.installment === inst)
      );
    }
    expense.settled = computeSettled(expense, card.user);

    await expense.save();
    res.json(serializeExpense(expense));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Herramienta de admin para probar la feature sin esperar un mes real:
// adelanta un mes las cuotas de todas las tarjetas propias (corriendo hacia
// atrás el createdAt de cada gasto) y manda el recordatorio correspondiente.
export async function advanceCreditCardsMonth(req, res) {
  try {
    const cards = await CreditCard.find({ user: req.user.id });
    const cardIds = cards.map((c) => c._id);
    const expenses = await CreditExpense.find({ card: { $in: cardIds }, settled: { $ne: true } });

    for (const expense of expenses) {
      const shifted = new Date(expense.createdAt);
      shifted.setMonth(shifted.getMonth() - 1);
      expense.createdAt = shifted;
      await expense.save();
    }

    const sent = await sendReminderForCards(cards);
    res.json({ ok: true, cardsNotified: sent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
