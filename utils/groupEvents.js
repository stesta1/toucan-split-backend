import GroupEvent from '../models/GroupEvent.js';
import { groupBalance, matchDebts } from './settlement.js';

const round2 = (n) => Math.round(n * 100) / 100;

// Foto de las deudas de un split, con nombres para poder leerla directo en la base.
export function debtSnapshot(group) {
  const name = (id) => group.members.find((m) => m.id === id)?.name ?? null;
  const balance = groupBalance(group);
  return {
    balances: Object.entries(balance).map(([id, net]) => ({ id, name: name(id), net: round2(net) })),
    debts: matchDebts(balance).map((d) => ({ ...d, fromName: name(d.from), toName: name(d.to) })),
  };
}

// Copia plana (sin métodos de mongoose) de un gasto o pago, para guardarla en el historial.
export function plain(subdoc) {
  const obj = typeof subdoc?.toObject === 'function' ? subdoc.toObject() : { ...subdoc };
  if (obj._id) obj.id = obj._id.toString();
  delete obj._id;
  return obj;
}

// Registra un evento del split. Nunca rompe la acción principal: si falla, solo lo loguea.
// before: foto tomada antes del cambio (debtSnapshot); after: por defecto, el estado actual.
export async function logGroupEvent({ group, user, type, data = null, before = null, after }) {
  try {
    await GroupEvent.create({
      groupId: group._id.toString(),
      groupName: group.name,
      type,
      actor: user ? { id: user.id, name: user.name, isAdmin: !!user.isAdmin } : null,
      data,
      before,
      after: after === undefined ? debtSnapshot(group) : after,
    });
  } catch (e) {
    console.error(`No se pudo registrar el evento ${type} del split ${group?._id}:`, e.message);
  }
}
