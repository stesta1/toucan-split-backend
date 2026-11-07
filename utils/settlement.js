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

// Transferencias pendientes de un split. Se recorren gastos y pagos en el orden en que
// se cargaron:
// - Cada gasto cambia lo que le corresponde a cada uno, así que las transferencias se
//   vuelven a calcular de cero con los saldos (matchDebts), como hacía la app original.
// - Cada pago descuenta solo de SU transferencia (from → to); las demás no se tocan.
//   Así, pagar una transferencia de la lista nunca cambia a quién le debe el resto.
// - Si un pago no entra en ninguna transferencia pendiente (pagó de más, o un gasto se
//   editó después de que pagara), se recalcula de cero con los saldos.
// En todos los casos los saldos que quedan son los mismos que los de groupBalance:
// cada uno debe (o cobra) exactamente lo que le corresponde, contando lo que ya transfirió.
export function settleGroup(group) {
  const balance = {};
  for (const member of group.members) balance[member.id] = 0;
  const add = (id, amount) => { balance[id] = (balance[id] || 0) + amount; };

  const events = [
    ...group.expenses.map((e, i) => ({ kind: 'expense', at: new Date(e.createdAt).getTime() || 0, i, item: e })),
    ...group.payments.map((p, i) => ({ kind: 'payment', at: new Date(p.createdAt).getTime() || 0, i, item: p })),
  ].sort((a, b) => (a.at - b.at) || (a.kind === b.kind ? a.i - b.i : a.kind === 'expense' ? -1 : 1));

  let edges = new Map();
  const replan = () => {
    edges = new Map(matchDebts(balance).map((d) => [`${d.from}>${d.to}`, d.amount]));
  };

  for (const { kind, item } of events) {
    if (kind === 'expense') {
      const share = item.amount / item.participants.length;
      add(item.paidBy, item.amount);
      for (const participantId of item.participants) add(participantId, -share);
      replan();
    } else {
      add(item.from, item.amount);
      add(item.to, -item.amount);
      const key = `${item.from}>${item.to}`;
      const owed = edges.get(key) || 0;
      if (item.amount <= owed + CENT / 2) edges.set(key, Math.max(0, owed - item.amount));
      else replan();
    }
  }

  const debts = [];
  for (const [key, amount] of edges) {
    const rounded = Math.round(amount * 100) / 100;
    if (rounded < CENT) continue;
    const [from, to] = key.split('>');
    debts.push({ from, to, amount: rounded });
  }
  return debts;
}
