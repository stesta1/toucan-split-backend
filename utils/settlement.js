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

// Saldo de cada integrante contando solo los gastos (sin pagos).
function expenseBalance(group) {
  return groupBalance({ members: group.members, expenses: group.expenses, payments: [] });
}

// Suma una deuda from → to a las transferencias, compensando con la inversa si existe
// (si A le debe 100 a B y se suma "B le debe 30 a A", queda A → B 70).
function addDebt(edges, from, to, amount) {
  const reverse = `${to}>${from}`;
  const owedBack = edges.get(reverse) || 0;
  if (owedBack > 0) {
    const offset = Math.min(owedBack, amount);
    edges.set(reverse, owedBack - offset);
    amount -= offset;
  }
  if (amount > 0) {
    const key = `${from}>${to}`;
    edges.set(key, (edges.get(key) || 0) + amount);
  }
}

// Transferencias pendientes de un split, estables frente a los pagos:
// 1. Con los gastos se arma la lista mínima de transferencias (matchDebts).
// 2. Cada pago, en orden, descuenta de SU transferencia (from → to); las demás no se tocan.
// 3. Si un pago supera lo que se debía en esa transferencia (pago de más), el excedente
//    queda como deuda inversa: quien cobró de más se lo debe a quien pagó.
// Así, pagar una transferencia de la lista nunca cambia a quién le debe el resto.
// Los saldos que quedan son siempre los mismos que los de groupBalance.
export function settleGroup(group) {
  const edges = new Map();
  for (const d of matchDebts(expenseBalance(group))) edges.set(`${d.from}>${d.to}`, d.amount);

  const payments = [...group.payments]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (new Date(a.p.createdAt) - new Date(b.p.createdAt)) || (a.i - b.i))
    .map(({ p }) => p);

  for (const payment of payments) {
    const key = `${payment.from}>${payment.to}`;
    const owed = edges.get(key) || 0;
    const covered = Math.min(owed, payment.amount);
    edges.set(key, owed - covered);
    const excess = payment.amount - covered;
    if (excess >= CENT / 2) addDebt(edges, payment.to, payment.from, excess);
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
