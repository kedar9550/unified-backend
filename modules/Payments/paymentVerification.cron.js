const cron = require('node-cron');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const PaymentRegistration = require('./PaymentRegistration.model');

let isVerificationRunning = false;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getRazorpayInstance = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error('[Payment Cron] Razorpay keys not configured in environment variables');
    return null;
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

/**
 * Verify an individual PaymentRegistration document against Razorpay
 * @param {Object} registration - Mongoose document
 * @param {Object} rzpInstance - Razorpay instance
 * @returns {Object} result summary
 */
const verifySinglePendingOrder = async (registration, rzpInstance) => {
  const orderId = registration.razorpayOrderId;
  if (!orderId || !orderId.startsWith('order_')) {
    return { id: registration._id, orderId, status: 'SKIPPED', reason: 'Invalid orderId format' };
  }

  try {
    const orderPayments = await rzpInstance.orders.fetchPayments(orderId);

    if (orderPayments && Array.isArray(orderPayments.items) && orderPayments.items.length > 0) {
      // Look for a successful payment (captured or authorized)
      const successfulPayment = orderPayments.items.find(
        (p) => p.status === 'captured' || p.status === 'authorized'
      );

      if (successfulPayment) {
        registration.paymentStatus = 'PAID';
        registration.verified = true;
        registration.razorpayPaymentId = successfulPayment.id;
        registration.razorpaySignature = registration.razorpaySignature === 'PENDING' ? 'CRON_GATEWAY_VERIFIED' : registration.razorpaySignature;
        registration.paidAt = successfulPayment.created_at ? new Date(successfulPayment.created_at * 1000) : new Date();

        // Ensure barcode exists for all participants
        if (Array.isArray(registration.participants)) {
          registration.participants.forEach((p) => {
            if (!p.barcode) {
              p.barcode = crypto.randomBytes(4).toString('hex').toUpperCase();
            }
          });
        }

        registration.rawPaymentData = {
          ...(registration.rawPaymentData || {}),
          razorpayCompleteResponse: successfulPayment,
          verifiedVia: 'CRONJOB',
          verifiedAt: new Date(),
        };

        await registration.save();

        // Asynchronously send invoice email
        try {
          const eventsController = require('../Events/Events.controller');
          const emailPayload = {
            email: (Array.isArray(registration.participants) && registration.participants[0]?.email) ? registration.participants[0].email : '',
            invoiceId: `INV/${new Date().getFullYear()}/${registration._id.toString().substring(18)}`.toUpperCase(),
            invoiceDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
            eventName: registration.eventName || '',
            teamSize: Number(registration.teamSize) || 1,
            amountPaid: registration.amount || (successfulPayment.amount / 100),
            participants: Array.isArray(registration.participants) ? registration.participants : [],
          };

          if (emailPayload.email) {
            eventsController.sendInvoiceMailInternal(emailPayload).catch((mailErr) => {
              console.error(`[Payment Cron] Error sending invoice email for ${registration._id}:`, mailErr.message);
            });
          }
        } catch (mailErr) {
          console.error(`[Payment Cron] Failed to initiate invoice mail for ${registration._id}:`, mailErr.message);
        }

        return { id: registration._id, orderId, status: 'PAID', paymentId: successfulPayment.id };
      }

      // Check if there are only failed payment attempts
      const hasOnlyFailed = orderPayments.items.every((p) => p.status === 'failed');
      if (hasOnlyFailed) {
        return { id: registration._id, orderId, status: 'FAILED_ATTEMPTS', count: orderPayments.items.length };
      }

      return { id: registration._id, orderId, status: 'PENDING_ON_GATEWAY' };
    }

    return { id: registration._id, orderId, status: 'NO_PAYMENT_ATTEMPTS' };
  } catch (err) {
    console.error(`[Payment Cron] Error verifying order ${orderId}:`, err.message);
    return { id: registration._id, orderId, status: 'ERROR', error: err.message };
  }
};

/**
 * Verifies all pending registrations in batches with rate-limiting
 * @param {Object} options - { limit, delayMs, maxAgeMinutes }
 * @returns {Object} Batch summary
 */
const verifyAllPendingOrders = async (options = {}) => {
  const { limit = 100, delayMs = 150 } = options;

  if (isVerificationRunning) {
    console.log('[Payment Cron] Verification is already running in background. Skipping duplicate run.');
    return { inProgress: true, message: 'Verification already in progress' };
  }

  const rzp = getRazorpayInstance();
  if (!rzp) {
    return { error: 'Razorpay keys not configured' };
  }

  isVerificationRunning = true;
  const startTime = Date.now();

  try {
    // Exclude registrations created in the last 2 minutes so we don't interfere with in-flight checkouts
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

    const pendingRegistrations = await PaymentRegistration.find({
      paymentStatus: 'PENDING',
      razorpayOrderId: { $exists: true, $ne: '', $regex: /^order_/ },
      createdAt: { $lte: twoMinutesAgo },
    })
      .sort({ createdAt: -1 })
      .limit(limit);

    console.log(`[Payment Cron] Found ${pendingRegistrations.length} pending registration(s) to verify with Razorpay.`);

    const results = {
      totalFound: pendingRegistrations.length,
      verifiedToPaid: 0,
      stillPending: 0,
      failedAttempts: 0,
      noAttempts: 0,
      errors: 0,
      details: [],
    };

    for (let i = 0; i < pendingRegistrations.length; i++) {
      const reg = pendingRegistrations[i];
      const res = await verifySinglePendingOrder(reg, rzp);

      if (res.status === 'PAID') {
        results.verifiedToPaid++;
        results.details.push({ id: res.id, orderId: res.orderId, paymentId: res.paymentId, status: 'PAID' });
        console.log(`[Payment Cron] Successfully verified payment for order ${res.orderId} (Payment ID: ${res.paymentId})`);
      } else if (res.status === 'FAILED_ATTEMPTS') {
        results.failedAttempts++;
      } else if (res.status === 'NO_PAYMENT_ATTEMPTS') {
        results.noAttempts++;
      } else if (res.status === 'ERROR') {
        results.errors++;
      } else {
        results.stillPending++;
      }

      // Small delay between requests to respect Razorpay rate limits
      if (i < pendingRegistrations.length - 1 && delayMs > 0) {
        await delay(delayMs);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[Payment Cron] Verification complete in ${duration}s. Checked: ${results.totalFound}, Verified: ${results.verifiedToPaid}, Errors: ${results.errors}`
    );

    return { ...results, durationSeconds: Number(duration) };
  } catch (err) {
    console.error('[Payment Cron] Global error during batch verification:', err);
    return { error: err.message };
  } finally {
    isVerificationRunning = false;
  }
};

/**
 * Initializes the node-cron scheduled task
 */
const initPaymentCron = () => {
  const isEnabled = process.env.PAYMENT_CRON_ENABLED !== 'false';
  const cronSchedule = process.env.PAYMENT_CRON_SCHEDULE || '*/10 * * * *'; // default every 10 minutes

  if (!isEnabled) {
    console.log('[Payment Cron] Payment verification cron job is disabled (PAYMENT_CRON_ENABLED=false).');
    return null;
  }

  if (!cron.validate(cronSchedule)) {
    console.error(`[Payment Cron] Invalid cron schedule expression: "${cronSchedule}". Cron not started.`);
    return null;
  }

  console.log(`[Payment Cron] Initializing payment verification cron job with schedule: "${cronSchedule}"`);

  const task = cron.schedule(cronSchedule, async () => {
    console.log(`[Payment Cron] Triggering scheduled payment verification [${new Date().toISOString()}]`);
    try {
      await verifyAllPendingOrders({ limit: 100, delayMs: 150 });
    } catch (err) {
      console.error('[Payment Cron] Scheduled task execution failed:', err);
    }
  });

  return task;
};

module.exports = {
  verifySinglePendingOrder,
  verifyAllPendingOrders,
  initPaymentCron,
};
