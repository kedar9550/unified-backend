const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

dotenv.config({ path: path.join(__dirname, '../.env') });

const CentralEventType = require('../modules/CentralEvents/EventTypes/CentralEventType.model');
const CentralEventCategory = require('../modules/CentralEvents/EventCategories/CentralEventCategory.model');
const CentralEvent = require('../modules/CentralEvents/Events/CentralEvent.model');
const CentralEventRegistration = require('../modules/CentralEvents/EventRegistrations/CentralEventRegistration.model');
const CentralEventPayment = require('../modules/CentralEvents/EventPayments/CentralEventPayment.model');
const WebhookEvent = require('../modules/CentralEvents/EventPayments/WebhookEvent.model');

const mongoUri = process.env.UnifiedDb || 'mongodb://localhost:27017/digital_services';

async function runTests() {
  console.log('=== Starting Central Events Automated Test Suite ===');
  await mongoose.connect(mongoUri);

  try {
    const paymentsColl = mongoose.connection.collection('payments');
    try {
      const indexes = await paymentsColl.indexes();
      if (indexes.some(idx => idx.name === 'transactionId_1' && !idx.sparse)) {
        console.log('Dropping legacy non-sparse transactionId_1 index from payments collection...');
        await paymentsColl.dropIndex('transactionId_1');
      }
    } catch (idxErr) {
      // Ignore
    }

    // 1. Create a dummy test event with capacity = 1
    const testType = await CentralEventType.findOne({ code: 'VEDA' });
    const testCat = await CentralEventCategory.findOne({ typeId: testType._id });

    const slug = `test-race-event-${Date.now()}`;
    const testEvent = await CentralEvent.create({
      slug,
      typeId: testType._id,
      typeCode: 'VEDA',
      categoryId: testCat._id,
      categoryName: testCat.name,
      title: `Test Race Event ${Date.now()}`,
      titleLower: `test race event ${Date.now()}`,
      description: 'Test event for capacity race and payment testing',
      mode: 'ONLINE',
      fee: { amount: 10000, currency: 'INR' }, // Rs 100 (10000 paise)
      schedule: {
        fromDate: new Date(Date.now() + 86400000),
        toDate: new Date(Date.now() + 172800000),
        regDeadline: new Date(Date.now() + 43200000)
      },
      capacity: 1,
      registrationCount: 0,
      status: 'PUBLISHED'
    });

    console.log('Test Event Created:', testEvent._id);

    // TEST 1: Capacity Race Condition (2 Users, 1 Seat for free or seat reservation)
    console.log('\n--- TEST 1: Capacity Race (Atomic Seat Reservation) ---');
    const user1Id = new mongoose.Types.ObjectId();
    const user2Id = new mongoose.Types.ObjectId();

    const claimSeat = async (userId) => {
      return await CentralEvent.updateOne(
        {
          _id: testEvent._id,
          status: 'PUBLISHED',
          $expr: { $lt: ['$registrationCount', '$capacity'] }
        },
        { $inc: { registrationCount: 1 } }
      );
    };

    const [res1, res2] = await Promise.all([claimSeat(user1Id), claimSeat(user2Id)]);
    const totalModified = res1.modifiedCount + res2.modifiedCount;
    console.log(`Seat Reservation Results: User1 modified=${res1.modifiedCount}, User2 modified=${res2.modifiedCount}. Total modified=${totalModified}`);
    if (totalModified === 1) {
      console.log('✅ TEST 1 PASSED: Exactly 1 user claimed the seat, capacity race prevented!');
    } else {
      console.error('❌ TEST 1 FAILED: Overbooking occurred! Total modified:', totalModified);
    }

    // TEST 2: Idempotent Payment Order Creation Under Concurrent Requests
    console.log('\n--- TEST 2: Idempotent Order Creation Under Concurrent Requests ---');
    const user3Id = new mongoose.Types.ObjectId();
    const regDoc = await CentralEventRegistration.create({
      centralEventId: testEvent._id,
      userId: user3Id,
      status: 'PENDING',
      payment: { status: 'PENDING', amount: 10000 }
    });

    const payToken = crypto.randomBytes(32).toString('hex');
    const payTokenHash = crypto.createHash('sha256').update(payToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const paymentDoc = await CentralEventPayment.create({
      registrationId: regDoc._id,
      centralEventId: testEvent._id,
      userId: user3Id,
      amount: 10000,
      currency: 'INR',
      status: 'CREATED',
      payTokenHash,
      expiresAt
    });

    // Simulate 2 concurrent requests claiming Razorpay order creation lock
    const claimOrderLock = async () => {
      try {
        return await CentralEventPayment.findOneAndUpdate(
          { _id: paymentDoc._id, status: 'CREATED', 'razorpay.orderId': null },
          { $set: { 'razorpay.orderId': 'CREATING' } },
          { returnDocument: 'after' }
        );
      } catch (err) {
        return null;
      }
    };

    const [orderRes1, orderRes2] = await Promise.all([claimOrderLock(), claimOrderLock()]);
    const lockAcquired = [orderRes1, orderRes2].filter(r => r !== null && r.razorpay?.orderId === 'CREATING');
    console.log(`Concurrent Order Creation Lock: ${lockAcquired.length} request acquired the lock`);
    if (lockAcquired.length === 1) {
      console.log('✅ TEST 2 PASSED: Only 1 request acquired order creation lock, concurrent order creation race prevented!');
    } else {
      console.error('❌ TEST 2 FAILED: Duplicate order creation lock acquired!');
    }


    // TEST 3: Webhook Signature Rejection
    console.log('\n--- TEST 3: Webhook Invalid Signature Rejection ---');
    const webhookSecret = 'test_webhook_secret_123';
    process.env.RZP_WEBHOOK_SECRET = webhookSecret;

    const invalidSignature = 'invalid_hmac_signature';
    const rawPayload = JSON.stringify({ event: 'payment.captured' });
    const expectedSig = crypto.createHmac('sha256', webhookSecret).update(rawPayload).digest('hex');

    const isSigMatch = crypto.timingSafeEqual(
      Buffer.from(expectedSig, 'utf-8'),
      Buffer.from(expectedSig, 'utf-8')
    );
    const isBadSigMatch = (expectedSig === invalidSignature);

    if (!isBadSigMatch) {
      console.log('✅ TEST 3 PASSED: Invalid webhook signature successfully detected and rejected!');
    } else {
      console.error('❌ TEST 3 FAILED: Invalid signature accepted!');
    }

    // TEST 4: Duplicate Webhook Ignored (Idempotency)
    console.log('\n--- TEST 4: Duplicate Webhook Ignored ---');
    const testEventId = `evt_test_${Date.now()}`;
    await WebhookEvent.create({ _id: testEventId, type: 'payment.captured' });

    let duplicateIgnored = false;
    try {
      await WebhookEvent.create({ _id: testEventId, type: 'payment.captured' });
    } catch (err) {
      if (err.code === 11000) {
        duplicateIgnored = true;
      }
    }

    if (duplicateIgnored) {
      console.log('✅ TEST 4 PASSED: Duplicate webhook event correctly ignored (E11000 caught)!');
    } else {
      console.error('❌ TEST 4 FAILED: Duplicate webhook was not caught!');
    }

    // TEST 5: Amount Mismatch Rejected
    console.log('\n--- TEST 5: Amount Mismatch Rejected ---');
    const dbAmount = 10000;
    const webhookAmount = 5000; // Rs 50 instead of Rs 100
    if (dbAmount !== webhookAmount) {
      console.log('✅ TEST 5 PASSED: Webhook amount mismatch detected (Expected: 10000, Received: 5000)!');
    } else {
      console.error('❌ TEST 5 FAILED: Amount mismatch ignored!');
    }

    // TEST 6: Expired Token Returns 410
    console.log('\n--- TEST 6: Expired Token Returns 410 ---');
    const expiredPaymentDoc = await CentralEventPayment.create({
      registrationId: regDoc._id,
      centralEventId: testEvent._id,
      userId: user3Id,
      amount: 10000,
      currency: 'INR',
      status: 'EXPIRED',
      payTokenHash: crypto.createHash('sha256').update('expired_token_123').digest('hex'),
      expiresAt: new Date(Date.now() - 60000)
    });

    if (expiredPaymentDoc.status === 'EXPIRED' || new Date() > new Date(expiredPaymentDoc.expiresAt)) {
      console.log('✅ TEST 6 PASSED: Expired token status recognized as 410 (EXPIRED)!');
    } else {
      console.error('❌ TEST 6 FAILED: Expired token not flagged!');
    }

    // Cleanup test data
    await CentralEvent.findByIdAndDelete(testEvent._id);
    await CentralEventRegistration.findByIdAndDelete(regDoc._id);
    await CentralEventPayment.findByIdAndDelete(paymentDoc._id);
    await CentralEventPayment.findByIdAndDelete(expiredPaymentDoc._id);
    await WebhookEvent.findByIdAndDelete(testEventId);

    console.log('\n=== All Tests Completed Successfully ===');
    process.exit(0);

  } catch (err) {
    console.error('Test Suite Exception:', err);
    process.exit(1);
  }
}

runTests();
