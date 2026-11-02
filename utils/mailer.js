import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function sendPasswordResetEmail(to, username, newPassword) {
  await transporter.sendMail({
    from: `TarugoCash <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Tu nueva contraseña de TarugoCash',
    text:
      `Hola @${username},\n\n` +
      `Reseteamos tu contraseña de TarugoCash. Esta es tu contraseña nueva:\n\n` +
      `${newPassword}\n\n` +
      `Te recomendamos cambiarla apenas inicies sesión, desde Configuración de la cuenta.\n\n` +
      `— TarugoCash`,
  });
}
