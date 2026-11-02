// Un gasto está "activo" en el mes N (1-indexado) desde que se creó, hasta
// que se le acaban las cuotas — salvo que ya esté completamente pagado
// (settled), en cuyo caso deja de contar para el total del mes y de generar
// recordatorios sin importar el cálculo de fechas.
export function currentInstallmentNumber(expense, today = new Date()) {
  const created = expense.createdAt;
  const monthsElapsed =
    (today.getFullYear() - created.getFullYear()) * 12 + (today.getMonth() - created.getMonth());
  const raw = monthsElapsed + 1;
  return Math.min(Math.max(raw, 1), expense.installments);
}

export function isInstallmentActive(expense, today = new Date()) {
  if (expense.settled) return false;
  const created = expense.createdAt;
  const monthsElapsed =
    (today.getFullYear() - created.getFullYear()) * 12 + (today.getMonth() - created.getMonth());
  const raw = monthsElapsed + 1;
  return raw >= 1 && raw <= expense.installments;
}

// Participantes que le deben plata al dueño de la tarjeta este gasto (todos
// menos el propio dueño, que paga la tarjeta y no se debe a sí mismo).
export function debtorsOf(expense, ownerId) {
  return expense.participants.filter((p) => p.id !== ownerId);
}

// ¿Ya está pagada la cuota N de este participante?
export function isInstallmentPaid(expense, participantId, installment) {
  return expense.payments.some((p) => p.participantId === participantId && p.installment === installment);
}

// Un gasto queda "liquidado" (y deja de mostrarse) cuando todos los
// deudores pagaron todas las cuotas.
export function computeSettled(expense, ownerId) {
  const debtors = debtorsOf(expense, ownerId);
  const totalCells = debtors.length * expense.installments;
  if (totalCells === 0) return false;
  const paidCells = expense.payments.filter((p) => debtors.some((d) => d.id === p.participantId)).length;
  return paidCells >= totalCells;
}
