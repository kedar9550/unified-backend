Payments module

Routes:

- POST `/api/razorpay/create-order` -> creates a Razorpay order. Body: `{ amount: <number in paisa>, currency?: 'INR', receipt?: string }`
- POST `/api/razorpay/verify-payment` -> verifies Razorpay payment signature. Body: `{ order_id, payment_id, signature }`

Environment variables required:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

Install Razorpay in your backend project: `npm install razorpay`

Mounting

Add the payments router to your existing Express app (CommonJS) like:

```js
// in your app entry (e.g. app.js or server.js)
const paymentsRouter = require('./modules/Payments/Payments.route');
app.use('/api/razorpay', paymentsRouter);
```

Example

See `unified-backend/server-example.js` for a minimal runnable example that mounts the Payments routes.
