import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Group from '../models/Group.js';
import { signToken } from '../utils/jwt.js';
import { COOKIE_NAME, cookieOptions } from '../utils/cookie.js';
import { uploadAvatarBuffer, deleteAvatarUpload } from '../utils/cloudinary.js';
import { sendPasswordResetEmail } from '../utils/mailer.js';

// El nombre y la foto de cada miembro quedan copiados dentro de los grupos al
// momento de crearlos, así que hay que propagar los cambios a los grupos existentes.
async function syncMemberFieldToGroups(userId, field, value) {
  await Group.updateMany(
    { 'members.id': userId },
    { $set: { [`members.$[m].${field}`]: value } },
    { arrayFilters: [{ 'm.id': userId }] }
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function register(req, res) {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Usuario, mail y contraseña son requeridos' });
    }
    if (!EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'El mail no es válido' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();

    const existingUsername = await User.findOne({ username: normalizedUsername });
    if (existingUsername) return res.status(409).json({ error: 'Ese usuario ya existe' });

    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) return res.status(409).json({ error: 'Ese mail ya está registrado' });

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: normalizedUsername,
      email: normalizedEmail,
      password: hash,
      name: username.trim(),
    });

    const token = signToken(user);
    res.cookie(COOKIE_NAME, token, cookieOptions);
    res.status(201).json({ ...user.toJSON(), token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

const PASSWORD_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function generateRandomPassword(length = 12) {
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += PASSWORD_CHARS[bytes[i] % PASSWORD_CHARS.length];
  }
  return password;
}

export async function forgotPassword(req, res) {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'El usuario es requerido' });
    }

    const genericMessage = 'Si el usuario existe y tiene un mail asociado, le enviamos una contraseña nueva.';
    const user = await User.findOne({ username: username.trim().toLowerCase() });
    if (!user || !user.email) {
      return res.json({ ok: true, message: genericMessage });
    }

    const newPassword = generateRandomPassword();
    await sendPasswordResetEmail(user.email, user.username, newPassword);

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ ok: true, message: genericMessage });
  } catch (e) {
    res.status(500).json({ error: 'No pudimos enviar el mail. Intentá de nuevo más tarde.' });
  }
}

export async function login(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }

    const user = await User.findOne({ username: username.trim().toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    const token = signToken(user);
    res.cookie(COOKIE_NAME, token, cookieOptions);
    res.json({ ...user.toJSON(), token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function logout(req, res) {
  res.clearCookie(COOKIE_NAME, cookieOptions);
  res.json({ ok: true });
}

export async function me(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    res.json(user.toJSON());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function updateProfile(req, res) {
  try {
    const { name, alias, email } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'El nombre es requerido' });
      user.name = name.trim();
    }
    if (alias !== undefined) {
      user.alias = alias.trim() || null;
    }
    if (email !== undefined) {
      const trimmedEmail = email.trim();
      if (trimmedEmail) {
        if (!EMAIL_RE.test(trimmedEmail)) {
          return res.status(400).json({ error: 'El mail no es válido' });
        }
        const normalizedEmail = trimmedEmail.toLowerCase();
        const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
        if (existing) return res.status(409).json({ error: 'Ese mail ya está registrado' });
        user.email = normalizedEmail;
      } else {
        user.email = null;
      }
    }
    await user.save();

    if (name !== undefined) {
      await syncMemberFieldToGroups(user._id.toString(), 'name', user.name);
    }
    if (alias !== undefined) {
      await syncMemberFieldToGroups(user._id.toString(), 'alias', user.alias);
    }

    const token = signToken(user);
    res.cookie(COOKIE_NAME, token, cookieOptions);
    res.json({ ...user.toJSON(), token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function dismissHint(req, res) {
  try {
    const { hint } = req.body;
    if (!hint) return res.status(400).json({ error: 'Falta el hint' });

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $addToSet: { dismissedHints: hint } },
      { new: true }
    );
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    res.json(user.toJSON());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Completá todos los campos' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: 'La contraseña actual es incorrecta' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function uploadAvatar(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const result = await uploadAvatarBuffer(req.file.buffer, user._id.toString());
    user.avatarUrl = result.secure_url;
    await user.save();

    await syncMemberFieldToGroups(user._id.toString(), 'avatarUrl', user.avatarUrl);

    res.json(user.toJSON());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function deleteAvatar(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    await deleteAvatarUpload(user._id.toString());
    user.avatarUrl = null;
    await user.save();

    await syncMemberFieldToGroups(user._id.toString(), 'avatarUrl', null);

    res.json(user.toJSON());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
