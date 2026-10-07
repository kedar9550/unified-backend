const cron = require('node-cron');
const CentralEventPayment = require('./CentralEventPayment.model');
const CentralEventRegistration = require('../EventRegistrations/CentralEventRegistration.model');
const { getRazorpayInstance, confirmRegistrationAndSeat } = require('./eventPayments.controller');

/**
 * Reconcile job: Runs every 5 minutes
 */
const startPaymentReconcileCron = () => {
  // Cron job disabled
  return;

  // const cronEnabled = process.env.PAYMENT_CRON_ENABLED !== 'false';
  // if (!cronEnabled) {
  //   console.log('[CRON] Central Events payment reconcile cron is disabled by config.');
  //   return;
  // }
  //
  // console.log('[CRON] Starting Central Events payment reconcile cron job (every 5 minutes)...');
  //
  // cron.schedule('*/5 * * * *', async () => {
  //   try {
  //     console.log('[CRON] Running payment reconciliation...');
  //     const rzp = getRazorpayInstance();
  //
  //     const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
  //
  //     // 1. Fetch CREATED payments older than 5 mins with orderId
  //     const pendingPayments = await CentralEventPayment.find({
  //       status: 'CREATED',
  //       'razorpay.orderId': { $ne: null, $nin: ['', 'CREATING'] },
  //       createdAt: { $lt: fiveMinsAgo }
  //     });
  //
  //     for (const paymentDoc of pendingPayments) {
  //       try {
  //         const orderId = paymentDoc.razorpay.orderId;
  //         const paymentsList = await rzp.orders.fetchPayments(orderId);
  //
  //         if (paymentsList && paymentsList.items && paymentsList.items.length > 0) {
  //           const captured = paymentsList.items.find(p => p.status === 'captured' || p.status === 'paid');
  //           if (captured) {
  //             if (captured.amount === paymentDoc.amount && captured.currency === paymentDoc.currency) {
  //               paymentDoc.status = 'PAID';
  //               paymentDoc.paidAt = new Date();
  //               paymentDoc.razorpay.paymentId = captured.id;
  //               await paymentDoc.save();
  //
  //               await confirmRegistrationAndSeat(paymentDoc.registrationId, paymentDoc._id);
  //               console.log(`[CRON] Reconciled order ${orderId} as PAID`);
  //               continue;
  //             }
  //           }
  //         }
  //
  //         // 2. Check if expired
  //         if (new Date() > new Date(paymentDoc.expiresAt)) {
  //           paymentDoc.status = 'EXPIRED';
  //           await paymentDoc.save();
  //
  //           await CentralEventRegistration.updateOne(
  //             { _id: paymentDoc.registrationId, status: 'PENDING' },
  //             { $set: { 'payment.status': 'EXPIRED', status: 'CANCELLED' } }
  //           );
  //           console.log(`[CRON] Expired pending payment ${paymentDoc._id}`);
  //         }
  //       } catch (singleErr) {
  //         console.error(`[CRON] Error reconciling payment ${paymentDoc._id}:`, singleErr.message);
  //       }
  //     }
  //   } catch (cronErr) {
  //     console.error('[CRON] Error in payment reconciliation cron job:', cronErr);
  //   }
  // });
};

module.exports = { startPaymentReconcileCron };
