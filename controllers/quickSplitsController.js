import crypto from 'crypto';
import QuickSplit from '../models/QuickSplit.js';
import User from '../models/User.js';
import { matchDebts } from '../utils/settlement.js';

const SHARE_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // sin 0/O/1/l/I

function generateShareCode(length = 8) {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += SHARE_CODE_CHARS[bytes[i] % SHARE_CODE_CHARS.length];
  }
  return code;
}

function serializeQuickSplit(qs, creator = null) {
  const balance = {};
  for (const m of qs.members) balance[m.id] = 0;
  for (const e of qs.expenses) {
    const share = e.amount / e.participants.length;
    balance[e.paidBy] += e.amount;
    for (const pid of e.participants) balance[pid] -= share;
  }

  return {
    id: qs.shareCode,
    name: qs.name,
    createdBy: qs.createdBy,
    members: qs.members.map((m) => ({
      id: m.id,
      name: m.name,
      avatarUrl: m.id === qs.createdBy ? creator?.avatarUrl ?? null : null,
      // El creador es el único con cuenta: se muestra su alias para que le transfieran.
      alias: m.id === qs.createdBy ? creator?.alias ?? null : null,
    })),
    expenses: qs.expenses.map((e) => ({
      description: e.description,
      amount: e.amount,
      paidBy: e.paidBy,
      participants: e.participants,
    })),
    debts: matchDebts(balance),
    createdAt: qs.createdAt,
  };
}

export async function createQuickSplit(req, res) {
  try {
    const { name, members, expenses } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'El nombre es requerido' });
    if (!Array.isArray(members) || members.length < 2) {
      return res.status(400).json({ error: 'Cargá al menos 2 integrantes' });
    }
    if (!Array.isArray(expenses) || expenses.length === 0) {
      return res.status(400).json({ error: 'Cargá al menos un gasto' });
    }

    const seenNames = new Set();
    const seenIds = new Set();
    for (const m of members) {
      if (!m.id || !m.name?.trim()) {
        return res.status(400).json({ error: 'Todos los integrantes necesitan un nombre' });
      }
      const normalized = m.name.trim().toLowerCase();
      if (seenNames.has(normalized)) {
        return res.status(400).json({ error: `El nombre "${m.name.trim()}" está repetido` });
      }
      if (seenIds.has(m.id)) {
        return res.status(400).json({ error: 'Integrantes inválidos' });
      }
      seenNames.add(normalized);
      seenIds.add(m.id);
    }

    const memberIds = members.map((m) => m.id);
    for (const e of expenses) {
      if (!e.description?.trim() || !e.amount || parseFloat(e.amount) <= 0 || !e.paidBy || !e.participants?.length) {
        return res.status(400).json({ error: 'Todos los gastos necesitan descripción, monto, pagador y participantes' });
      }
      if (!memberIds.includes(e.paidBy) || !e.participants.every((p) => memberIds.includes(p))) {
        return res.status(400).json({ error: 'Pagador y participantes deben ser integrantes cargados' });
      }
    }

    const payload = {
      name: name.trim(),
      createdBy: req.user.id,
      members: members.map((m) => ({ id: m.id, name: m.name.trim() })),
      expenses: expenses.map((e) => ({
        description: e.description.trim(),
        amount: parseFloat(e.amount),
        paidBy: e.paidBy,
        participants: e.participants,
      })),
    };

    let quickSplit;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        quickSplit = await QuickSplit.create({ ...payload, shareCode: generateShareCode() });
        break;
      } catch (e) {
        if (e.code === 11000 && attempt < 4) continue; // shareCode repetido, muy poco probable — reintenta
        throw e;
      }
    }

    const creator = await User.findById(req.user.id).select('avatarUrl alias');
    res.status(201).json(serializeQuickSplit(quickSplit, creator));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function getMyQuickSplits(req, res) {
  try {
    const splits = await QuickSplit.find({ createdBy: req.user.id }).sort({ createdAt: -1 });
    res.json(splits.map((qs) => ({
      id: qs.shareCode,
      name: qs.name,
      memberCount: qs.members.length,
      expenseCount: qs.expenses.length,
      createdAt: qs.createdAt,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Pública a propósito: es lo que abren los amigos sin cuenta con el link.
export async function getQuickSplit(req, res) {
  try {
    const quickSplit = await QuickSplit.findOne({ shareCode: req.params.id });
    if (!quickSplit) return res.status(404).json({ error: 'Split no encontrado' });
    const creator = await User.findById(quickSplit.createdBy).select('avatarUrl alias');
    res.json(serializeQuickSplit(quickSplit, creator));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function deleteQuickSplit(req, res) {
  try {
    const quickSplit = await QuickSplit.findOne({ shareCode: req.params.id });
    if (!quickSplit) return res.status(404).json({ error: 'Split no encontrado' });
    if (!req.user.isAdmin && quickSplit.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'Solo quien lo creó puede eliminarlo' });
    }
    await quickSplit.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
