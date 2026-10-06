const CentralEventPayment = require('./CentralEventPayment.model');
const WebhookEvent = require('./WebhookEvent.model');
const CentralEventRegistration = require('../EventRegistrations/CentralEventRegistration.model');
const CentralEvent = require('../Events/CentralEvent.model');
const crypto = require('crypto');
const Razorpay = require('razorpay');

/**
 * Lazy init Razorpay instance
 */
const getRazorpayInstance = () => {
  const key_id = process.env.RZP_KEY_ID || process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RZP_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    throw new Error('Razorpay credentials (RZP_KEY_ID / RZP_KEY_SECRET) not configured in environment');
  }
  return new Razorpay({ key_id, key_secret });
};

/**
 * GET /payments/session/:token
 * Creates or reuses exactly ONE Razorpay order atomically
 */
const getPaymentSession = async (req, res, next) => {
  try {
    const { token } = req.params;
    const userId = req.user?.userId;

    if (!token) {
      res.status(400);
      return next(new Error('Token is required'));
    }

    const payTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const payment = await CentralEventPayment.findOne({ payTokenHash });

    if (!payment) {
      res.status(410);
      return next(new Error('Invalid or expired payment link'));
    }

    // Check Expiration
    if (payment.status === 'EXPIRED' || new Date() > new Date(payment.expiresAt)) {
      if (payment.status !== 'EXPIRED') {
        payment.status = 'EXPIRED';
        await payment.save();
      }
      res.status(410);
      return next(new Error('Payment link has expired'));
    }

    // Check Ownership
    if (payment.userId.toString() !== userId.toString()) {
      res.status(403);
      return next(new Error('Access denied: Payment link belongs to another user'));
    }

    // If already paid
    if (payment.status === 'PAID') {
      return res.json({
        success: true,
        status: 'PAID',
        message: 'Payment already completed'
      });
    }

    // Idempotent Order Creation
    if (payment.razorpay && payment.razorpay.orderId) {
      const keyId = process.env.RZP_KEY_ID || process.env.RAZORPAY_KEY_ID;
      return res.json({
        success: true,
        data: {
          orderId: payment.razorpay.orderId,
          amount: payment.amount,
          currency: payment.currency,
          keyId,
          expiresAt: payment.expiresAt,
          registrationId: payment.registrationId
        }
      });
    }

    // Claim order creation atomically using lock field/condition
    const lockedPayment = await CentralEventPayment.findOneAndUpdate(
      { _id: payment._id, status: 'CREATED', 'razorpay.orderId': null },
      { $set: { 'razorpay.orderId': 'CREATING' } },
      { new: true }
    );

    let orderId;
    const rzp = getRazorpayInstance();

    if (lockedPayment && lockedPayment.razorpay.orderId === 'CREATING') {
      try {
        const order = await rzp.orders.create({
          amount: payment.amount,
          currency: payment.currency || 'INR',
          receipt: payment._id.toString(),
          notes: {
            registrationId: payment.registrationId.toString(),
            paymentId: payment._id.toString()
          }
        });

        orderId = order.id;
        lockedPayment.razorpay.orderId = orderId;
        await lockedPayment.save();
      } catch (orderErr) {
        // Unlock on failure
        await CentralEventPayment.updateOne(
          { _id: payment._id },
          { $set: { 'razorpay.orderId': null } }
        );
        throw orderErr;
      }
    } else {
      // Another concurrent request created it or is creating it, reload
      const reloaded = await CentralEventPayment.findById(payment._id);
      orderId = reloaded.razorpay.orderId;
    }

    const keyId = process.env.RZP_KEY_ID || process.env.RAZORPAY_KEY_ID;
    res.json({
      success: true,
      data: {
        orderId,
        amount: payment.amount,
        currency: payment.currency,
        keyId,
        expiresAt: payment.expiresAt,
        registrationId: payment.registrationId
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * POST /payments/verify (UX feedback only, does NOT mark paid in DB)
 */
const verifyPaymentSignature = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const secret = process.env.RZP_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      res.status(400);
      return next(new Error('Missing required Razorpay verification payload'));
    }

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generatedSignature = hmac.digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(generatedSignature, 'utf-8'),
      Buffer.from(razorpay_signature, 'utf-8')
    );

    if (!isValid) {
      res.status(400);
      return next(new Error('Invalid payment signature'));
    }

    res.json({
      success: true,
      message: 'Payment signature verified. Confirming registration via webhook...'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper: Confirm Registration & Increment seat count atomically
 */
const confirmRegistrationAndSeat = async (registrationId, paymentId) => {
  const reg = await CentralEventRegistration.findById(registrationId);
  if (!reg) return;

  if (reg.status === 'CONFIRMED') return; // already confirmed

  const eventId = reg.centralEventId;

  // Atomic seat increment
  const updateResult = await CentralEvent.updateOne(
    {
      _id: eventId,
      $expr: { $lt: ['$registrationCount', '$capacity'] }
    },
    { $inc: { registrationCount: 1 } }
  );

  if (updateResult.modifiedCount === 0) {
    console.error(`[ALERT] Event ${eventId} is FULL! Payment ${paymentId} succeeded but seat capacity reached. Flag for refund!`);
    reg.status = 'CANCELLED';
    reg.payment.status = 'REFUNDED';
    await reg.save();
    return;
  }

  reg.status = 'CONFIRMED';
  reg.payment.status = 'PAID';
  reg.payment.paymentId = paymentId;
  reg.payment.paidAt = new Date();
  await reg.save();
};

/**
 * POST /payments/webhook (Source of truth)
 */
const handleRazorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RZP_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('RZP_WEBHOOK_SECRET is not defined in environment variables');
      return res.status(500).send('Webhook secret missing');
    }

    if (!signature) {
      return res.status(400).send('Missing X-Razorpay-Signature header');
    }

    // Raw body validation
    const rawBody = req.body; // Buffer or string from express.raw()
    const hmac = crypto.createHmac('sha256', webhookSecret);
    hmac.update(rawBody);
    const expectedSignature = hmac.digest('hex');

    const isSigValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'utf-8'),
      Buffer.from(signature, 'utf-8')
    );

    if (!isSigValid) {
      console.warn('Webhook signature mismatch rejected');
      return res.status(400).send('Invalid signature');
    }

    const payload = JSON.parse(rawBody.toString('utf-8'));
    const eventId = req.headers['x-razorpay-event-id'] || payload.event_id;
    const eventType = payload.event;

    // Idempotency check via webhook_events collection
    try {
      await WebhookEvent.create({ _id: eventId, type: eventType, receivedAt: new Date() });
    } catch (dbErr) {
      if (dbErr.code === 11000) {
        // Duplicate event ignored
        return res.status(200).json({ status: 'ignored', message: 'Event already processed' });
      }
      throw dbErr;
    }

    // Handle Payment Events
    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      const paymentEntity = payload.payload?.payment?.entity || payload.payload?.order?.entity;
      const orderId = paymentEntity?.order_id || payload.payload?.order?.entity?.id;
      const paymentId = paymentEntity?.id;
      const amount = paymentEntity?.amount;
      const currency = paymentEntity?.currency;

      if (orderId) {
        const paymentDoc = await CentralEventPayment.findOne({ 'razorpay.orderId': orderId });
        if (paymentDoc) {
          // Amount & currency verification
          if (paymentDoc.amount !== amount || paymentDoc.currency !== currency) {
            console.error(`Amount/currency mismatch for order ${orderId}. Expected ${paymentDoc.amount}, got ${amount}`);
            return res.status(400).send('Amount mismatch');
          }

          // Conditional update: only update if status is CREATED
          if (paymentDoc.status === 'CREATED') {
            paymentDoc.status = 'PAID';
            paymentDoc.paidAt = new Date();
            if (paymentId) paymentDoc.razorpay.paymentId = paymentId;
            await paymentDoc.save();

            // Confirm Registration & increment capacity
            await confirmRegistrationAndSeat(paymentDoc.registrationId, paymentDoc._id);
          }
        }
      }
    } else if (eventType === 'payment.failed') {
      const paymentEntity = payload.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;

      if (orderId) {
        const paymentDoc = await CentralEventPayment.findOne({ 'razorpay.orderId': orderId });
        if (paymentDoc && paymentDoc.status === 'CREATED') {
          paymentDoc.status = 'FAILED';
          await paymentDoc.save();

          await CentralEventRegistration.updateOne(
            { _id: paymentDoc.registrationId },
            { $set: { 'payment.status': 'FAILED' } }
          );
        }
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Error handling Razorpay webhook:', error);
    res.status(500).send('Webhook processing error');
  }
};

module.exports = {
  getPaymentSession,
  verifyPaymentSignature,
  handleRazorpayWebhook,
  confirmRegistrationAndSeat,
  getRazorpayInstance
};
