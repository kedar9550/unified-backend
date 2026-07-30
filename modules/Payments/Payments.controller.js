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
    const { email, roll } = req.query;

    const query = {};

    if (email && email.trim()) {
      const cleanEmail = email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (roll && roll.trim()) {
        const cleanRoll = roll.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.$and = [
          { 'participants.email': { $regex: new RegExp(`^${cleanEmail}$`, 'i') } },
          { 'participants.roll': { $regex: new RegExp(`^${cleanRoll}$`, 'i') } }
        ];
      } else {
        query['participants.email'] = { $regex: new RegExp(`^${cleanEmail}$`, 'i') };
      }
    } else if (roll && roll.trim()) {
      const cleanRoll = roll.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query['participants.roll'] = { $regex: new RegExp(`^${cleanRoll}$`, 'i') };
    }

    let payments = await PaymentRegistration.find(query).sort({ createdAt: -1 }).lean();

    if (payments.length === 0 && email && email.trim() && roll && roll.trim()) {
      const cleanEmail = email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const fallbackQuery = {
        'participants.email': { $regex: new RegExp(`^${cleanEmail}$`, 'i') }
      };
      payments = await PaymentRegistration.find(fallbackQuery).sort({ createdAt: -1 }).lean();
    }

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

    let fetchedPayment = null;
    try {
      fetchedPayment = await paymentsService.fetchPayment(payment_id);
    } catch (err) {
      console.error('Error fetching complete payment details from Razorpay:', err);
    }

    const parsedAmountInPaisa = fetchedPayment ? fetchedPayment.amount : Number(amountInPaisa ?? amount ?? 0);
    const parsedAmountInRupees = fetchedPayment ? fetchedPayment.amount / 100 : Number(
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
      rawPaymentData: fetchedPayment 
        ? { ...(rawPaymentData || req.body), razorpayCompleteResponse: fetchedPayment } 
        : (rawPaymentData || req.body),
    });

    await registration.save();

    return res.status(201).json({ ok: true, registrationId: registration._id });
  } catch (err) {
    console.error('Payments.verifyPayment error', err);
    return res.status(500).json({ error: 'Unable to verify payment', details: err.message });
  }
};
