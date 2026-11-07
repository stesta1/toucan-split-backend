// Montos por debajo de un centavo son residuos de redondeo (ej: dividir $1000 en 3
// deja 0,0033 colgando después de pagar $333,33): no son deudas reales.
const CENT = 0.01;

// Dado un balance neto por persona (positivo = le deben, negativo = debe),
// arma la lista mínima de transferencias que salda todo. Greedy: el mayor
// acreedor cobra del mayor deudor hasta que alguno llega a cero.
export function matchDebts(balance) {
  const creditors = [];
  const debtors = [];
  for (const [id, net] of Object.entries(balance)) {
    if (net >= CENT) creditors.push({ id, amount: net });
    if (net <= -CENT) debtors.push({ id, amount: -net });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const result = [];
  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.amount, debtor.amount);
    const rounded = Math.round(amount * 100) / 100;

    if (rounded >= CENT) result.push({ from: debtor.id, to: creditor.id, amount: rounded });

    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount < CENT) ci++;
    if (debtor.amount < CENT) di++;
  }

  return result;
}

// Balance neto por integrante de un split = lo que pagó − lo que consumió (± pagos registrados).
export function groupBalance(group) {
  const balance = {};
  for (const member of group.members) {
    balance[member.id] = 0;
  }
  for (const expense of group.expenses) {
    const share = expense.amount / expense.participants.length;
    balance[expense.paidBy] += expense.amount;
    for (const participantId of expense.participants) {
      balance[participantId] -= share;
    }
  }
  for (const payment of group.payments) {
    balance[payment.from] += payment.amount;
    balance[payment.to]   -= payment.amount;
  }
  return balance;
}
