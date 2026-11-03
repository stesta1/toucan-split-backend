import Group from '../models/Group.js';
import User from '../models/User.js';
import { matchDebts } from '../utils/settlement.js';
import { notifyUsers } from '../utils/notify.js';
import { nonFriendIds } from '../utils/friends.js';

export function serializeGroup(g, withExpenses = true) {
  const obj = {
    id: g._id.toString(),
    name: g.name,
    createdBy: g.createdBy,
    members: g.members,
    createdAt: g.createdAt,
    expenseCount: g.expenses.length,
  };
  if (withExpenses) {
    obj.expenses = g.expenses.map((e) => ({
      id: e._id.toString(),
      description: e.description,
      amount: e.amount,
      paidBy: e.paidBy,
      participants: e.participants,
      createdAt: e.createdAt,
    }));
    obj.payments = g.payments.map((p) => ({
      id: p._id.toString(),
      from: p.from,
      to: p.to,
      amount: p.amount,
      createdAt: p.createdAt,
    }));
  }
  return obj;
}

function isMember(group, userId) {
  return group.members.some((m) => m.id === userId);
}

function isGroupAdmin(group, userId) {
  if (group.createdBy === userId) return true;
  return !!group.members.find((m) => m.id === userId)?.isGroupAdmin;
}

// Datos del integrante para mostrar su avatar en la notificación (con fallback al actor sin foto).
function memberAsFromUser(members, memberId, fallbackUser) {
  const member = members.find((m) => m.id === memberId);
  if (member) return { id: member.id, name: member.name, avatarUrl: member.avatarUrl };
  return { id: fallbackUser.id, name: fallbackUser.name, avatarUrl: null };
}

export async function getGroups(req, res) {
  try {
    const groups = await Group.find({ 'members.id': req.user.id }).sort({ createdAt: -1 });
    res.json(groups.map((g) => serializeGroup(g, true)));
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
    await group.save();

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
    await group.deleteOne();
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

    group.expenses.push({ description, amount: parseFloat(amount), paidBy, participants });
    await group.save();

    const expense = group.expenses[group.expenses.length - 1];

    const share = expense.amount / participants.length;
    const debtors = participants.filter((p) => p !== paidBy);
    await notifyUsers(debtors, req.user.id, {
      type: 'expense_added',
      message: `${req.user.name} agregó "${description}" en "${group.name}" — te toca pagar $${share.toFixed(2)}`,
      link: `/grupos/${group._id.toString()}`,
      fromUser: memberAsFromUser(group.members, paidBy, req.user),
    });

    res.status(201).json({
      id: expense._id.toString(),
      description: expense.description,
      amount: expense.amount,
      paidBy: expense.paidBy,
      participants: expense.participants,
      createdAt: expense.createdAt,
    });
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
    if (!expense) return res.status(404).json({ error: 'Gasto no encontrado' });

    const canEdit = req.user.isAdmin || isGroupAdmin(group, req.user.id) || expense.paidBy === req.user.id;
    if (!canEdit) {
      return res.status(403).json({ error: 'No tenés permiso para editar este gasto' });
    }

    const { description, amount, paidBy, participants } = req.body;
    if (!description || !amount || !paidBy || !participants?.length) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    const memberIds = group.members.map((m) => m.id);
    if (!memberIds.includes(paidBy) || !participants.every((p) => memberIds.includes(p))) {
      return res.status(400).json({ error: 'Pagador y participantes deben ser miembros del grupo' });
    }

    expense.description = description;
    expense.amount = parseFloat(amount);
    expense.paidBy = paidBy;
    expense.participants = participants;
    await group.save();

    res.json({
      id: expense._id.toString(),
      description: expense.description,
      amount: expense.amount,
      paidBy: expense.paidBy,
      participants: expense.participants,
      createdAt: expense.createdAt,
    });
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
    if (!expense) return res.status(404).json({ error: 'Gasto no encontrado' });

    const canDelete = req.user.isAdmin || isGroupAdmin(group, req.user.id);
    if (!canDelete) {
      return res.status(403).json({ error: 'No tenés permiso para eliminar este gasto' });
    }

    expense.deleteOne();
    await group.save();
    res.json({ ok: true });
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

    // Paso 1: balance neto por persona = lo que pagó − lo que consumió
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

    res.json({ debts: matchDebts(balance) });
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

    group.payments.push({ from, to, amount: parseFloat(amount) });
    await group.save();

    await notifyUsers([to], req.user.id, {
      type: 'payment_received',
      message: `${req.user.name} te pagó $${parseFloat(amount).toFixed(2)} en "${group.name}"`,
      link: `/grupos/${group._id.toString()}`,
      fromUser: memberAsFromUser(group.members, from, req.user),
    });

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
    await group.save();

    res.json(serializeGroup(group));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
