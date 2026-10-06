const Razorpay = require('razorpay');
const crypto = require('crypto');

const getRazorpayInstance = () => {
  const keyId = process.env.RAZORPAY_KEY_ID || 'dummy_key';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || 'dummy_secret';
  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
};

exports.createOrder = async ({ amount, currency = 'INR', receipt }) => {
  const options = {
    amount,
    currency,
    receipt: receipt || `receipt_${Date.now()}`,
  };
  const instance = getRazorpayInstance();
  const order = await instance.orders.create(options);
  return order;
};

exports.verifySignature = ({ order_id, payment_id, signature }) => {
  const generated = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
    .update(`${order_id}|${payment_id}`)
    .digest('hex');
  return generated === signature;
};

exports.fetchPayment = async (payment_id) => {
  const instance = getRazorpayInstance();
  return await instance.payments.fetch(payment_id);
};
