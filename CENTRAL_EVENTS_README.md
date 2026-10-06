# Central Events Management & QR-based Razorpay Payment Module

This module provides a unified architecture for managing all Central Event types (**VEDA**, **COLORS**, **ALA**, **CLUB**, **DEPARTMENTAL**, **UNIVERSITY**) and handles QR-based Razorpay payment checkouts with webhook verification.

---

## 🛠️ Architecture & Data Collections

The module uses isolated collections:
1. `central_event_types`: Event hierarchy definition & rules.
2. `central_event_categories`: Type categories (e.g. Robotics, Hackathons, Dance, Music).
3. `organizers`: Departmental or University scope organizing units.
4. `central_events`: Central event documents with slugs, dates, mode, venue, eligibility, rules, and fee details.
5. `central_event_registrations`: Student/Faculty registrations with payment statuses.
6. `payments`: Payment audit records with single active CREATED order partial index and 15-minute token expiration (`payTokenHash`).
7. `webhook_events`: Idempotent log of processed Razorpay webhooks (`x-razorpay-event-id`) with 30-day TTL.

---

## 🚀 Setup & Execution

### 1. Master Data Seeding
Run the seed script to initialize event types, categories, allowed levels/activity types, organizers, and MongoDB indexes:
```bash
node scripts/seedCentralEventsMasterData.js
```

### 2. Environment Variables (.env)
Ensure the following variables are present in your `unified-backend/.env`:
```env
RZP_KEY_ID=rzp_live_Kmh34Xa4jArEXT
RZP_KEY_SECRET=Z4CLr1a6w4pRBCTS4JbJM1L9
RZP_WEBHOOK_SECRET=central_events_wh_secret_key_2026
APP_URL=http://localhost:9023
PAYMENT_CRON_ENABLED=true
```

---

## ⚙️ Razorpay Dashboard Webhook Configuration

1. Log into your **Razorpay Dashboard** -> **Settings** -> **Webhooks**.
2. Click **Add New Webhook**.
3. **Webhook URL**: `https://<YOUR_DOMAIN_OR_NGROK>/api/payments/webhook`
4. **Secret**: Set to match `RZP_WEBHOOK_SECRET` in `.env` (e.g., `central_events_wh_secret_key_2026`).
5. **Active Events**: Select:
   - `payment.captured`
   - `order.paid`
   - `payment.failed`
6. Save the webhook.

---

## 🧪 Automated Testing

Run the comprehensive test suite to verify atomic seat reservation, concurrent order creation locks, webhook signature validation, duplicate webhook suppression, amount mismatch rejection, and token expiration:
```bash
node tests/centralEvents.test.js
```

---

## 📍 Key Frontend Routes

- List & Filter Events: `/central-events`
- Create Central Event: `/central-events/create`
- Event Details & Registration: `/central-events/:slug`
- QR Scan & Payment Checkout Landing: `/pay/:token`
