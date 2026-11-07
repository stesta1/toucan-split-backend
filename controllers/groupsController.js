import Group from '../models/Group.js';
import User from '../models/User.js';
import { expenseShare, expensesTotal, memberStatuses, settleGroup } from '../utils/settlement.js';
import { debtSnapshot, logGroupEvent, plain } from '../utils/groupEvents.js';
import { notifyUsers } from '../utils/notify.js';
import { nonFriendIds } from '../utils/friends.js';
import { publish } from '../utils/live.js';

// Ventana en la que un gasto idéntico de la misma persona se toma como duplicado.
const DUPLICATE_WINDOW_MS = 30000;

const STALE_MESSAGE = 'El split cambió mientras tanto. Actualizamos los datos: revisalos y confirmá de nuevo.';

// El split tal como lo muestra la app. Todo lo que se muestra calculado (deudas, estado de
// cada integrante, total, parte de cada gasto) sale de acá: el front no hace cuentas.
export function serializeGroup(g, withExpenses = true) {
  const debts = settleGroup(g);
  const obj = {
    id: g._id.toString(),
    name: g.name,
    createdBy: g.createdBy,
    members: g.members,
    createdAt: g.createdAt,
    version: g.version ?? 0,
    expenseCount: g.expenses.length,
    total: expensesTotal(g.expenses),
    debts,
    statuses: memberStatuses(g, debts),
  };
  if (withExpenses) {
    obj.expenses = g.expenses.map((e) => ({
      id: e._id.toString(),
      description: e.description,
      amount: e.amount,
      share: expenseShare(e),
      paidBy: e.paidBy,
      participants: e.participants,
      createdBy: e.createdBy ?? null,
      createdAt: e.createdAt,
    }));
    obj.payments = g.payments.map((p) => ({
      id: p._id.toString(),
      from: p.from,
      to: p.to,
      amount: p.amount,
      createdBy: p.createdBy ?? null,
      createdAt: p.createdAt,
    }));
  }
  return obj;
}

function serializeExpense(e) {
  return {
    id: e._id.toString(),
    description: e.description,
    amount: e.amount,
    share: expenseShare(e),
    paidBy: e.paidBy,
    participants: e.participants,
    createdBy: e.createdBy ?? null,
    createdAt: e.createdAt,
  };
}

function isMember(group, userId) {
  return group.members.some((m) => m.id === userId);
}

function isGroupAdmin(group, userId) {
  if (group.createdBy === userId) return true;
  return !!group.members.find((m) => m.id === userId)?.isGroupAdmin;
}

// Quién puede editar o eliminar un gasto: quien lo cargó, un admin del grupo o de la app.
// Los gastos viejos no tienen createdBy: ahí cuenta quien figura como que pagó.
function canChangeExpense(group, expense, user) {
  if (user.isAdmin || isGroupAdmin(group, user.id)) return true;
  return expense.createdBy ? expense.createdBy === user.id : expense.paidBy === user.id;
}

// Datos del integrante para mostrar su avatar en la notificación (con fallback al actor sin foto).
function memberAsFromUser(members, memberId, fallbackUser) {
  const member = members.find((m) => m.id === memberId);
  if (member) return { id: member.id, name: member.name, avatarUrl: member.avatarUrl };
  return { id: fallbackUser.id, name: fallbackUser.name, avatarUrl: null };
}

// ---------- Versión del split ----------
// Cada cambio sube group.version. Para registrar un pago o editar/eliminar un gasto, la app
// tiene que mandar la versión que está mostrando: si no es la actual, sus datos están viejos
// y se rechaza (409) devolviendo el split actualizado.

// Versión que dice estar viendo la app: body.version, o ?version= en un DELETE.
function requestedVersion(req) {
  const raw = req.body?.version ?? req.query?.version;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

function staleResponse(res, group, error = STALE_MESSAGE) {
  return res.status(409).json({ error, code: 'STALE', group: serializeGroup(group) });
}

// Responde 409 y devuelve false si la app no está viendo la versión actual del split.
function ensureCurrentVersion(req, res, group) {
  const seen = requestedVersion(req);
  if (seen === null) {
    res.status(409).json({
      error: 'Actualizá la app (recargá la página) para poder hacer cambios en este split.',
      code: 'VERSION_REQUIRED',
      group: serializeGroup(group),
    });
    return false;
  }
  if (seen !== (group.version ?? 0)) {
    staleResponse(res, group);
    return false;
  }
  return true;
}

// Guarda el split solo si nadie lo cambió desde que se leyó (sigue en la misma versión) y
// sube la versión, todo en una sola operación de Mongo. Devuelve false si alguien lo
// cambió antes; en ese caso no se guardó nada.
async function saveVersioned(group) {
  const current = group.version ?? 0;
  // Los splits creados antes de existir la versión no tienen el campo: cuentan como 0.
  group.$where = { version: current === 0 ? { $in: [0, null] } : current };
  group.version = current + 1;
  try {
    await group.save();
    return true;
  } catch (e) {
    if (e.name === 'DocumentNotFoundError' || e.name === 'VersionError') return false;
    throw e;
  } finally {
    group.$where = undefined;
  }
}

// Cuando saveVersioned no pudo guardar: se relee el split y se responde 409 con lo actual.
async function respondConflict(res, groupId) {
  const fresh = await Group.findById(groupId);
  if (!fresh) return res.status(404).json({ error: 'Grupo no encontrado' });
  return staleResponse(res, fresh);
}

// Aviso en vivo a los integrantes: "este split cambió", para que vuelvan a pedirlo.
function announce(group, extra = {}) {
  publish(group.members.map((m) => m.id), 'group', {
    groupId: group._id.toString(),
    version: group.version ?? 0,
    ...extra,
  });
}

// ---------- Endpoints ----------

export async function getGroups(req, res) {
  try {
    const groups = await Group.find({ 'members.id': req.user.id }).sort({ createdAt: -1 });
    res.json(groups.map((g) => serializeGroup(g, true)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Totales de Inicio: cuánto debés y te deben sumando todos tus splits.
export async function getSummary(req, res) {
  try {
    const groups = await Group.find({ 'members.id': req.user.id });
    const summary = { owe: 0, owed: 0, oweGroups: 0, owedGroups: 0 };
    for (const g of groups) {
      const status = memberStatuses(g, settleGroup(g))[req.user.id];
      if (!status) continue;
      if (status.owe > 0) { summary.owe += status.owe; summary.oweGroups += 1; }
      if (status.owed > 0) { summary.owed += status.owed; summary.owedGroups += 1; }
    }
    summary.owe = Math.round(summary.owe * 100) / 100;
    summary.owed = Math.round(summary.owed * 100) / 100;
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function getGroup(req, res) {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });
    if (!req.user.isAdmin && !isMember(group, req.user.id)) {
      return res.status(403).json({ error: 'No pertenecés a este grupo' });
    }
    res.json(serializeGroup(group));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function createGroup(req, res) {
  try {
    const { name, memberIds } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es requerido' });

    const ids = Array.from(new Set([...(memberIds || []), req.user.id]));
    if (!req.user.isAdmin && (await nonFriendIds(req.user.id, ids)).length > 0) {
      return res.status(403).json({ error: 'Solo podés agregar a tus amigos' });
    }
    const users = await User.find({ _id: { $in: ids } });
    if (users.length < 2) {
      return res.status(400).json({ error: 'Seleccioná al menos 1 participante más' });
    }

    const members = users.map((u) => ({
      id: u._id.toString(),
      name: u.name,
      username: u.username,
      avatarUrl: u.avatarUrl,
      alias: u.alias,
      isGroupAdmin: u._id.toString() === req.user.id,
    }));
    const group = await Group.create({ name, createdBy: req.user.id, members });
    await logGroupEvent({ group, user: req.user, type: 'group_created', data: { name, members } });
    announce(group);

    await notifyUsers(members.map((m) => m.id), req.user.id, {
      type: 'group_member_added',
      message: `${req.user.name} te agregó al split "${group.name}"`,
      link: `/grupos/${group._id.toString()}`,
      fromUser: memberAsFromUser(members, req.user.id, req.user),
    });

    res.status(201).json(serializeGroup(group));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function addMembers(req, res) {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });
    if (!req.user.isAdmin && !isGroupAdmin(group, req.user.id)) {
      return res.status(403).json({ error: 'Solo un administrador del grupo puede agregar integrantes' });
    }

    const { memberIds } = req.body;
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: 'Seleccioná al menos un usuario' });
    }

    const existingIds = new Set(group.members.map((m) => m.id));
    const newIds = memberIds.filter((id) => !existingIds.has(id));
    if (newIds.length === 0) {
      return res.status(400).json({ error: 'Esos usuarios ya son parte del grupo' });
    }
    if (!req.user.isAdmin && (await nonFriendIds(req.user.id, newIds)).length > 0) {
      return res.status(403).json({ error: 'Solo podés agregar a tus amigos' });
    }

    const users = await User.find({ _id: { $in: newIds } });
    const before = debtSnapshot(group);
    for (const u of users) {
      group.members.push({
        id: u._id.toString(),
        name: u.name,
        username: u.username,
        avatarUrl: u.avatarUrl,
        alias: u.alias,
        isGroupAdmin: false,
      });
    }
    if (!(await saveVersioned(group))) return respondConflict(res, req.params.id);
    await logGroupEvent({
      group, user: req.user, type: 'members_added', before,
      data: { members: users.map((u) => ({ id: u._id.toString(), name: u.name, username: u.username })) },
    });
    announce(group);

    await notifyUsers(newIds, req.user.id, {
      type: 'group_member_added',
      message: `${req.user.name} te agregó al split "${group.name}"`,
      link: `/grupos/${group._id.toString()}`,
      fromUser: memberAsFromUser(group.members, req.user.id, req.user),
    });

    res.status(201).json(serializeGroup(group));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function deleteGroup(req, res) {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });
    if (!req.user.isAdmin && !isGroupAdmin(group, req.user.id)) {
      return res.status(403).json({ error: 'Solo un administrador del grupo puede eliminarlo' });
    }
    await logGroupEvent({
      group, user: req.user, type: 'group_deleted', before: debtSnapshot(group), after: null,
      data: { group: group.toObject() },
    });
    await group.deleteOne();
    announce(group, { deleted: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function addExpense(req, res) {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });
    // Un admin de la app puede VER cualquier grupo, pero no cargar gastos en uno del que no es parte.
    if (!isMember(group, req.user.id)) {
      return res.status(403).json({ error: 'No pertenecés a este grupo' });
    }

    const { description, amount, paidBy, participants } = req.body;
    if (!description || !amount || !paidBy || !participants?.length) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    const memberIds = group.members.map((m) => m.id);
    if (!memberIds.includes(paidBy) || !participants.every((p) => memberIds.includes(p))) {
      return res.status(400).json({ error: 'Pagador y participantes deben ser miembros del grupo' });
    }

    // Mismo gasto cargado dos veces seguidas por la misma persona (doble toque o reenvío):
    // se rechaza en vez de duplicarlo.
    const sameParticipants = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
    const duplicate = group.expenses.find((e) =>
      e.createdBy === req.user.id
      && Date.now() - new Date(e.createdAt).getTime() < DUPLICATE_WINDOW_MS
      && e.description === description
      && e.amount === parseFloat(amount)
      && e.paidBy === paidBy
      && sameParticipants(e.participants, participants));
    if (duplicate) {
      return res.status(409).json({ error: 'Ese gasto ya se cargó recién. Si es otro gasto igual, esperá unos segundos y cargalo de nuevo.' });
    }

    // Cargar un gasto nuevo no pisa nada de nadie: no se exige la versión que ve la app,
    // pero el guardado igual es atómico y sube la versión.
    const before = debtSnapshot(group);
    group.expenses.push({ description, amount: parseFloat(amount), paidBy, participants, createdBy: req.user.id });
    if (!(await saveVersioned(group))) return respondConflict(res, req.params.id);

    const expense = group.expenses[group.expenses.length - 1];
    await logGroupEvent({ group, user: req.user, type: 'expense_added', before, data: { expense: plain(expense) } });
    announce(group);

    const debtors = participants.filter((p) => p !== paidBy);
    await notifyUsers(debtors, req.user.id, {
      type: 'expense_added',
      message: `${req.user.name} agregó "${description}" en "${group.name}" — te toca pagar $${expenseShare(expense).toFixed(2)}`,
      link: `/grupos/${group._id.toString()}`,
      fromUser: memberAsFromUser(group.members, paidBy, req.user),
    });

    res.status(201).json({ ...serializeExpense(expense), group: serializeGroup(group) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function updateExpense(req, res) {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });
    if (!isMember(group, req.user.id)) {
      return res.status(403).json({ error: 'No pertenecés a este grupo' });
    }

    const expense = group.expenses.id(req.params.expenseId);
    if (!expense) return staleResponse(res, group, 'Ese gasto ya no existe: alguien lo eliminó.');

    if (!canChangeExpense(group, expense, req.user)) {
      return res.status(403).json({ error: 'Solo quien cargó el gasto o un admin del split puede editarlo' });
    }
    if (!ensureCurrentVersion(req, res, group)) return;

    const { description, amount, paidBy, participants } = req.body;
    if (!description || !amount || !paidBy || !participants?.length) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    const memberIds = group.members.map((m) => m.id);
    if (!memberIds.includes(paidBy) || !participants.every((p) => memberIds.includes(p))) {
      return res.status(400).json({ error: 'Pagador y participantes deben ser miembros del grupo' });
    }

    const before = debtSnapshot(group);
    const previous = plain(expense);
    expense.description = description;
    expense.amount = parseFloat(amount);
    expense.paidBy = paidBy;
    expense.participants = participants;
    if (!(await saveVersioned(group))) return respondConflict(res, req.params.id);
    await logGroupEvent({
      group, user: req.user, type: 'expense_updated', before,
      data: { previous, expense: plain(expense) },
    });
    announce(group);

    res.json({ ...serializeExpense(expense), group: serializeGroup(group) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function deleteExpense(req, res) {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });
    // Un admin de la app puede VER cualquier grupo, pero solo puede borrar gastos
    // en uno del que es parte (ahí sí puede borrar cualquiera, ver el check de abajo).
    if (!isMember(group, req.user.id)) {
      return res.status(403).json({ error: 'No pertenecés a este grupo' });
    }

    const expense = group.expenses.id(req.params.expenseId);
    if (!expense) return staleResponse(res, group, 'Ese gasto ya no existe: alguien lo eliminó.');

    if (!canChangeExpense(group, expense, req.user)) {
      return res.status(403).json({ error: 'Solo quien cargó el gasto o un admin del split puede eliminarlo' });
    }
    if (!ensureCurrentVersion(req, res, group)) return;

    const before = debtSnapshot(group);
    const removed = plain(expense);
    expense.deleteOne();
    if (!(await saveVersioned(group))) return respondConflict(res, req.params.id);
    await logGroupEvent({ group, user: req.user, type: 'expense_deleted', before, data: { expense: removed } });
    announce(group);
    res.json({ ok: true, group: serializeGroup(group) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function getSettlement(req, res) {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });
    if (!req.user.isAdmin && !isMember(group, req.user.id)) {
      return res.status(403).json({ error: 'No pertenecés a este grupo' });
    }

    res.json({ debts: settleGroup(group), version: group.version ?? 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function addPayment(req, res) {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });
    // Un admin de la app puede VER cualquier grupo, pero no marcar pagos en uno del que no es parte.
    if (!isMember(group, req.user.id)) {
      return res.status(403).json({ error: 'No pertenecés a este grupo' });
    }

    const { from, to, amount } = req.body;
    const memberIds = group.members.map((m) => m.id);
    if (!from || !to || from === to || !memberIds.includes(from) || !memberIds.includes(to)) {
      return res.status(400).json({ error: 'Deudor y acreedor deben ser miembros distintos del grupo' });
    }
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Ingresá un monto válido' });
    }
    if (!req.user.isAdmin && req.user.id !== from && req.user.id !== to) {
      return res.status(403).json({ error: 'Solo el deudor o el acreedor pueden marcar este pago' });
    }

    const before = debtSnapshot(group);
    const pending = before.debts.find((d) => d.from === from && d.to === to);
    const rejected = (reason) => logGroupEvent({
      group, user: req.user, type: 'payment_rejected', before, after: null,
      data: { request: { from, to, amount: parseFloat(amount), version: requestedVersion(req) }, reason, pending: pending ?? null },
    });

    // 1. La app tiene que estar viendo la versión actual: un pago hecho mirando datos viejos
    //    (pago repetido, deuda que cambió) no se acepta, ni de más ni de menos.
    if (requestedVersion(req) !== (group.version ?? 0)) await rejected('stale_version');
    if (!ensureCurrentVersion(req, res, group)) return;

    // 2. Y tiene que corresponder a una deuda pendiente, por hasta lo que se debe.
    if (!pending) {
      await rejected('not_pending');
      return staleResponse(res, group, 'Esta deuda ya no está pendiente. Actualizamos los datos.');
    }
    if (parseFloat(amount) > pending.amount + 0.01) {
      await rejected('amount_exceeds_debt');
      return staleResponse(res, group, `La deuda es de $${pending.amount.toFixed(2)}, no de $${parseFloat(amount).toFixed(2)}.`);
    }

    // 3. Se guarda solo si nadie cambió el split mientras tanto (dos pagos a la vez: entra uno).
    group.payments.push({ from, to, amount: parseFloat(amount), createdBy: req.user.id });
    if (!(await saveVersioned(group))) {
      await rejected('concurrent_change');
      return respondConflict(res, req.params.id);
    }
    await logGroupEvent({
      group, user: req.user, type: 'payment_added', before,
      data: { payment: plain(group.payments[group.payments.length - 1]) },
    });
    announce(group);

    // Se avisa a la otra persona del pago (a la que no lo registró).
    const amountText = `$${parseFloat(amount).toFixed(2)}`;
    const fromName = group.members.find((m) => m.id === from)?.name ?? req.user.name;
    const link = `/grupos/${group._id.toString()}`;
    if (req.user.id !== to) {
      await notifyUsers([to], req.user.id, {
        type: 'payment_received',
        message: `${fromName} te pagó ${amountText} en "${group.name}"`,
        link,
        fromUser: memberAsFromUser(group.members, from, req.user),
      });
    }
    if (req.user.id !== from) {
      await notifyUsers([from], req.user.id, {
        type: 'payment_confirmed',
        message: `${req.user.name} registró que le pagaste ${amountText} en "${group.name}"`,
        link,
        fromUser: memberAsFromUser(group.members, req.user.id, req.user),
      });
    }

    res.status(201).json(serializeGroup(group));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function setGroupMemberAdmin(req, res) {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });

    if (!req.user.isAdmin && !isGroupAdmin(group, req.user.id)) {
      return res.status(403).json({ error: 'Solo un administrador del grupo puede hacer esto' });
    }

    const { isGroupAdmin: nextIsGroupAdmin } = req.body;
    if (typeof nextIsGroupAdmin !== 'boolean') {
      return res.status(400).json({ error: 'isGroupAdmin debe ser true o false' });
    }

    const target = group.members.find((m) => m.id === req.params.memberId);
    if (!target) return res.status(404).json({ error: 'Integrante no encontrado' });

    if (target.isGroupAdmin && !nextIsGroupAdmin) {
      const adminCount = group.members.filter((m) => m.isGroupAdmin).length;
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'No se puede quitar al único administrador del grupo' });
      }
    }

    target.isGroupAdmin = nextIsGroupAdmin;
    if (!(await saveVersioned(group))) return respondConflict(res, req.params.id);
    await logGroupEvent({
      group, user: req.user, type: 'member_admin_changed', after: null,
      data: { memberId: target.id, memberName: target.name, isGroupAdmin: nextIsGroupAdmin },
    });
    announce(group);

    res.json(serializeGroup(group));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
