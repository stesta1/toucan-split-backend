# toucan-split-backend

API de Split: Node + Express + MongoDB (Mongoose). Corre separada del front, que la consume vía HTTP.

## Desarrollo

```bash
cp .env.example .env   # y completar las variables
npm install
npm run dev            # o npm start
```

La API queda en `http://localhost:291/api`.

Health check: `GET /health` (también en `/api/health`). Devuelve `200 { ok: true, db: "connected", uptime }` si la API está arriba y conectada a Mongo, o `503` si se perdió la conexión.

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `MONGO_DB_URL` | Sí | Cadena de conexión a MongoDB |
| `JWT_SECRET` | Sí | Firma de los tokens de sesión |
| `FRONTEND_URL` | Sí en prod | Orígenes permitidos por CORS, separados por coma (ej: `https://split.the2can.com`) |
| `PORT` | No (291) | Puerto de la API |
| `NODE_ENV` | No | `production` en prod |
| `ADMIN_USERNAME`, `ADMIN_NAME`, `ADMIN_PASSWORD` | No | Admin que se crea al arrancar si no existe ninguno. **Definí `ADMIN_PASSWORD`**: si falta, se usa un valor por defecto. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Para avatares | Subida de fotos de perfil |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Para recuperar contraseña | Envío de mails |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | No | Web push (el front actual no lo usa) |

## Autenticación

Login, registro y actualización de perfil devuelven `{ ...user, token }`. Los clientes mandan el JWT como `Authorization: Bearer <token>` (también se acepta la cookie `token` por compatibilidad).

## Docker

```bash
docker build -t toucan-split-backend .
docker run -p 291:291 --env-file .env toucan-split-backend
```
