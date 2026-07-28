const Razorpay = require('razorpay');
const crypto = require('crypto');

const instance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.createOrder = async ({ amount, currency = 'INR', receipt }) => {
  const options = {
    amount,
    currency,
    receipt: receipt || `receipt_${Date.now()}`,
  };
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
