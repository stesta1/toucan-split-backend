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

## Versión de cada split

Cada split tiene un campo `version` que sube en 1 con cada cambio: gastos, pagos, integrantes y admins.

- **Para registrar un pago o editar o eliminar un gasto**, la app tiene que mandar la versión que está mostrando: `version` en el body, o `?version=` en el `DELETE`.
- **Si no es la actual**, la app estaba mirando datos viejos y se rechaza con `409` (`code: "STALE"`), devolviendo el split actualizado en `group`. Si no manda versión (una app vieja), también es `409` (`code: "VERSION_REQUIRED"`).
- **El guardado es atómico:** se guarda solo si el split sigue en la versión que se leyó, y en la misma operación se sube. Si dos pagos llegan a la vez, entra uno y el otro recibe `409`.
- **Cargar un gasto nuevo** no exige versión, porque no pisa nada de nadie, pero igual la sube.

Un arreglo a mano en la base **también tiene que subir la versión**, para que las pantallas abiertas se enteren:

```json
{"update": "groups", "updates": [{"q": {"_id": {"$oid": "<id>"}}, "u": {"$pull": {"payments": {"_id": {"$oid": "<id del pago>"}}}, "$inc": {"version": 1}}}]}
```

## Datos calculados para mostrar

El front no hace cuentas: todo lo que se muestra calculado viene del backend.

- **Cada split** (`GET /groups`, `GET /groups/:id` y las respuestas de cada cambio) trae:
  - `total`: el gasto total;
  - `debts`: las transferencias pendientes;
  - `statuses`: por integrante, `kind` (`empty`, `settled`, `owe`, `owed` o `mixed`), `owe`, `owed` y `amount`;
  - `share` en cada gasto: lo que le toca a cada participante.
- **`GET /groups/summary`:** los totales de Inicio (cuánto debés y te deben sumando todos tus splits).
- **Splits exprés:** traen `total` y `share` de cada gasto.

## Avisos en vivo (`GET /api/live`)

Conexión de Server-Sent Events. Requiere el token como `Authorization: Bearer`, por eso la app la abre con `fetch`.

Cuando algo cambia, se avisa al instante a los usuarios conectados. Los avisos solo llevan identificadores, nunca montos; la app vuelve a pedir los datos a la API:

- `group`, con `{ groupId, version }` (o `deleted: true`): a los integrantes del split.
- `notification`: a quien recibió una notificación.
- `friends`: a quien le cancelaron o rechazaron una solicitud, o lo sacaron de amigos.

Detalles:

- Cada 25 segundos se manda una señal vacía, para que Cloudflare no corte la conexión por inactividad (corta a los ~100 s).
- La respuesta va con `Cache-Control: no-cache, no-transform` y `X-Accel-Buffering: no`, para que ningún proxy la retenga ni la comprima.
- Las conexiones se guardan en memoria: funciona con **una sola instancia** del backend. Con varias, haría falta repartir los avisos entre instancias (por ejemplo, con Redis).

## Historial de cada split (`groupevents`)

Cada acción sobre un split queda registrada en la colección `groupevents`: crear o eliminar el split, sumar integrantes, cambiar admins, cargar, editar o eliminar gastos, y registrar pagos. También se guardan los intentos de pago rechazados. Sirve para reconstruir paso a paso cómo se llegó a un estado.

Cada evento guarda:

- `type`: qué pasó (`expense_added`, `payment_added`, `payment_rejected`, `manual_fix`, etc.).
- `actor`: quién lo hizo (`id`, `name`).
- `data`: el gasto o pago completo. En ediciones, también el valor anterior (`previous`). Al eliminar un split, el split entero.
- `before` / `after`: el saldo de cada integrante y las transferencias pendientes antes y después de la acción, con nombres.

Los gastos (`expenses[].createdBy`) y los pagos (`payments[].createdBy`) guardan además quién los cargó.

Para ver la historia de un split en orden:

```json
{"find": "groupevents", "filter": {"groupId": "<id del split>"}, "sort": {"createdAt": 1}}
```

Para ver solo los pagos rechazados (pantallas desactualizadas o pagos repetidos):

```json
{"find": "groupevents", "filter": {"type": "payment_rejected"}, "sort": {"createdAt": -1}, "limit": 20}
```
