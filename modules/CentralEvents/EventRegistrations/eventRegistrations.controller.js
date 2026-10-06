const CentralEvent = require('../Events/CentralEvent.model');
const CentralEventRegistration = require('./CentralEventRegistration.model');
const CentralEventPayment = require('../EventPayments/CentralEventPayment.model');
const crypto = require('crypto');

/**
 * POST /central-events/:id/register
 */
const registerForCentralEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userType = req.user?.userType || 'Student';
    const { teamName, members } = req.body;

    if (!userId) {
      res.status(401);
      return next(new Error('User authentication required to register'));
    }

    // 1. Fetch Event
    const event = await CentralEvent.findById(id);
    if (!event) {
      res.status(404);
      return next(new Error('Central event not found'));
    }

    // 2. Validate Status
    if (event.status !== 'PUBLISHED') {
      res.status(400);
      return next(new Error(`Event is not open for registration (Current status: ${event.status})`));
    }

    // 3. Validate Deadline
    if (new Date() > new Date(event.schedule.regDeadline)) {
      res.status(400);
      return next(new Error('Registration deadline for this event has passed'));
    }

    // 4. Validate Capacity
    if (event.registrationCount >= event.capacity) {
      res.status(400);
      return next(new Error('Event capacity is full'));
    }

    // 5. Check Duplicate Registration
    const existingReg = await CentralEventRegistration.findOne({ centralEventId: id, userId });
    if (existingReg) {
      res.status(400);
      return next(new Error('You have already registered for this event'));
    }

    // 6. Handle Free vs Paid Event
    const isFree = !event.fee || event.fee.amount === 0;

    if (isFree) {
      // Atomic seat check & reservation
      const updateResult = await CentralEvent.updateOne(
        {
          _id: id,
          status: 'PUBLISHED',
          $expr: { $lt: ['$registrationCount', '$capacity'] }
        },
        { $inc: { registrationCount: 1 } }
      );

      if (updateResult.modifiedCount === 0) {
        res.status(400);
        return next(new Error('Event capacity reached. Unable to complete registration.'));
      }

      const registration = new CentralEventRegistration({
        centralEventId: id,
        userId,
        userType,
        teamName: event.participation?.type === 'TEAM' ? teamName : null,
        members: event.participation?.type === 'TEAM' ? members : [],
        payment: {
          status: 'FREE',
          amount: 0,
          paidAt: new Date()
        },
        status: 'CONFIRMED'
      });

      await registration.save();

      return res.status(201).json({
        success: true,
        message: 'Registration confirmed successfully!',
        data: { registration, isFree: true }
      });
    }

    // Paid Event Registration Flow
    const registration = new CentralEventRegistration({
      centralEventId: id,
      userId,
      userType,
      teamName: event.participation?.type === 'TEAM' ? teamName : null,
      members: event.participation?.type === 'TEAM' ? members : [],
      payment: {
        status: 'PENDING',
        amount: event.fee.amount
      },
      status: 'PENDING'
    });

    await registration.save();

    // Create Payment Token & Doc
    const payToken = crypto.randomBytes(32).toString('hex');
    const payTokenHash = crypto.createHash('sha256').update(payToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins expiry

    const payment = new CentralEventPayment({
      registrationId: registration._id,
      centralEventId: id,
      userId,
      amount: event.fee.amount,
      currency: event.fee.currency || 'INR',
      status: 'CREATED',
      payTokenHash,
      expiresAt
    });

    await payment.save();

    // Link payment ID back to registration
    registration.payment.paymentId = payment._id;
    await registration.save();

    const appUrl = process.env.APP_URL || process.env.FRONTEND_URI || 'http://localhost:9023';
    const payUrl = `${appUrl}/pay/${payToken}`;

    res.status(201).json({
      success: true,
      message: 'Registration initialized. Please complete payment within 15 minutes.',
      data: {
        registrationId: registration._id,
        paymentId: payment._id,
        payToken,
        payUrl,
        expiresAt,
        amount: event.fee.amount,
        currency: event.fee.currency || 'INR',
        isFree: false
      }
    });

  } catch (error) {
    if (error.code === 11000) {
      res.status(400);
      return next(new Error('You have already registered for this event'));
    }
    next(error);
  }
};

/**
 * GET /central-event-registrations/:id
 */
const getRegistrationById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const registration = await CentralEventRegistration.findById(id)
      .populate('centralEventId', 'title slug fee schedule venue banner mode')
      .lean();

    if (!registration) {
      res.status(404);
      return next(new Error('Registration not found'));
    }

    // Ownership check (unless admin)
    if (registration.userId.toString() !== req.user?.userId?.toString()) {
      res.status(403);
      return next(new Error('Access denied: Unauthorized to view this registration'));
    }

    res.json({ success: true, data: registration });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /central-event-registrations/my
 */
const getMyRegistrations = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401);
      return next(new Error('Authentication required'));
    }

    const registrations = await CentralEventRegistration.find({ userId })
      .populate('centralEventId', 'title slug banner schedule fee status mode venue')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: registrations });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerForCentralEvent,
  getRegistrationById,
  getMyRegistrations
};
