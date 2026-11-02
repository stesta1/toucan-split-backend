import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../models/User.js';
import Group from '../models/Group.js';
import QuickSplit from '../models/QuickSplit.js';
import { serializeGroup } from './groupsController.js';

export async function getUsers(req, res) {
  try {
    const users = await User.find().sort({ name: 1 });
    res.json(users.map((u) => u.toJSON()));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function createUser(req, res) {
  try {
    const { username, password, name, isAdmin } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Usuario, contraseña y nombre son requeridos' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const existing = await User.findOne({ username: username.trim().toLowerCase() });
    if (existing) return res.status(409).json({ error: 'Ese usuario ya existe' });

    const hash = await bcrypt.hash(password, 10);
    const placeholderEmail = `${username.trim().toLowerCase()}.${crypto.randomBytes(4).toString('hex')}@sin-email.tarugoapp.local`;
    const user = await User.create({
      username: username.trim().toLowerCase(),
      password: hash,
      name: name.trim(),
      email: placeholderEmail,
      isAdmin: !!isAdmin,
    });
    res.status(201).json(user.toJSON());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function setUserAdmin(req, res) {
  try {
    const { isAdmin } = req.body;
    if (typeof isAdmin !== 'boolean') {
      return res.status(400).json({ error: 'isAdmin debe ser true o false' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (user.isAdmin && !isAdmin) {
      const adminCount = await User.countDocuments({ isAdmin: true });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'No se puede quitar al único administrador' });
      }
    }

    user.isAdmin = isAdmin;
    await user.save();
    res.json(user.toJSON());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function setUserPassword(req, res) {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    user.password = await bcrypt.hash(password, 10);
    await user.save();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function deleteUser(req, res) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (user.isAdmin) {
      const adminCount = await User.countDocuments({ isAdmin: true });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'No se puede eliminar al único administrador' });
      }
    }

    await user.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function getGroups(req, res) {
  try {
    const groups = await Group.find().sort({ createdAt: -1 });
    res.json(groups.map((g) => serializeGroup(g, false)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function getQuickSplits(req, res) {
  try {
    const splits = await QuickSplit.find().sort({ createdAt: -1 });
    const creatorIds = [...new Set(splits.map((s) => s.createdBy))];
    const creators = await User.find({ _id: { $in: creatorIds } }).select('name username');
    const creatorMap = new Map(creators.map((u) => [u._id.toString(), u]));

    res.json(splits.map((qs) => {
      const creator = creatorMap.get(qs.createdBy);
      return {
        id: qs.shareCode,
        name: qs.name,
        memberCount: qs.members.length,
        expenseCount: qs.expenses.length,
        createdByName: creator?.name || null,
        createdByUsername: creator?.username || null,
        createdAt: qs.createdAt,
      };
    }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
