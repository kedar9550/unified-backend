const paymentsService = require('./Payments.service');
const PaymentRegistration = require('./PaymentRegistration.model');

exports.createOrder = async (req, res) => {
  try {
    const { amount, currency, receipt } = req.body;
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const order = await paymentsService.createOrder({ amount, currency, receipt });
    return res.json({ orderId: order.id, order });
  } catch (err) {
    console.error('Payments.createOrder error', err);
    return res.status(500).json({ error: 'Unable to create order', details: err.message });
  }
};

exports.getRegistrations = async (req, res) => {
  try {
    const payments = await PaymentRegistration.find().sort({ createdAt: -1 }).lean();
    return res.json({ payments });
  } catch (err) {
    console.error('Payments.getRegistrations error', err);
    return res.status(500).json({ error: 'Unable to fetch payment registrations', details: err.message });
  }
};

exports.verifyPayment = async (req, res) => {
  console.log(req.body);
  try {
    const {
      eventId,
      schoolId,
      category,
      eventName,
      amount,
      amountInPaisa,
      amountInRupees,
      amountRupees,
      currency = 'INR',
      teamSize,
      participants,
      receipt,
      order_id,
      payment_id,
      signature,
      rawPaymentData,
    } = req.body;

    if (!order_id || !payment_id || !signature) {
      return res.status(400).json({ error: 'Missing verification fields' });
    }

    const valid = paymentsService.verifySignature({ order_id, payment_id, signature });
    if (!valid) return res.status(400).json({ error: 'Invalid signature' });

    const parsedAmountInPaisa = Number(amountInPaisa ?? amount ?? 0);
    const parsedAmountInRupees = Number(
      amountRupees ?? amountInRupees ?? (parsedAmountInPaisa > 0 ? parsedAmountInPaisa / 100 : amount ?? 0)
    );
    const amountValue = Number.isFinite(parsedAmountInRupees) && parsedAmountInRupees > 0
      ? parsedAmountInRupees
      : Number(parsedAmountInPaisa > 0 ? parsedAmountInPaisa / 100 : amount ?? 0);

    if (Number.isNaN(amountValue) || amountValue <= 0) {
      return res.status(400).json({ error: 'Invalid amount value' });
    }

    const registration = new PaymentRegistration({
      eventId: eventId || '',
      schoolId: schoolId || '',
      category: category || '',
      eventName: eventName || '',
      amount: amountValue,
      amountRupees: amountValue,
      currency,
      teamSize: Number(teamSize) || 1,
      participants: Array.isArray(participants) ? participants : [],
      receipt: receipt || '',
      razorpayOrderId: order_id,
      razorpayPaymentId: payment_id,
      razorpaySignature: signature,
      paymentStatus: 'PAID',
      verified: true,
      rawPaymentData: rawPaymentData || req.body,
    });

    await registration.save();

    return res.status(201).json({ ok: true, registrationId: registration._id });
  } catch (err) {
    console.error('Payments.verifyPayment error', err);
    return res.status(500).json({ error: 'Unable to verify payment', details: err.message });
  }
};
