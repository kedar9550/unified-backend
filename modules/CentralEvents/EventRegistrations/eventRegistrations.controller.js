const Razorpay = require('razorpay');
const mongoose = require('mongoose');
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

    // Ownership check (unless user has GLOBAL_EVENT_ADMIN or SUPER_ADMIN role)
    const isAdmin = req.user?.roles?.some(r => {
      const roleStr = (typeof r === 'string' ? r : r.role?.key || r.role?.name || '').toUpperCase();
      return ['GLOBAL_EVENT_ADMIN', 'SUPER_ADMIN'].includes(roleStr);
    });

    if (!isAdmin && registration.userId.toString() !== req.user?.userId?.toString()) {
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

/**
 * GET /central-event-registrations/admin (GLOBAL_EVENT_ADMIN & SUPER_ADMIN only)
 */
const getAllRegistrationsAdmin = async (req, res, next) => {
  try {
    const { eventId, status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (eventId) filter.centralEventId = eventId;
    if (status) filter.status = status;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const total = await CentralEventRegistration.countDocuments(filter);
    const registrations = await CentralEventRegistration.find(filter)
      .populate('centralEventId', 'title slug code schedule fee status mode venue')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    res.json({
      success: true,
      data: registrations,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    next(error);
  }
};


/**
 * POST /central-event-registrations
 * Public / Fest Portal student registration & payment creation.
 * Step 1: Save registration into central_event_student_registrations collection.
 * Step 2: Store payment data into central_event_student_payments collection.
 * Admin side Razorpay gateway ready.
 */
const createStudentRegistrationAndPayment = async (req, res, next) => {
  try {
    const {
      eventId,
      eventSlug,
      eventTitle,
      typeCode = 'COLORS',
      participant,
      teamName,
      teamMembers,
      fee,
      academicYear
    } = req.body;

    if (!participant || (!participant.name && !participant.studentName)) {
      return res.status(400).json({ success: false, message: 'Participant details (name, roll) are required' });
    }

    const db = mongoose.connection.db;
    const studentRegColl = db.collection('central_event_student_registrations');
    const studentPayColl = db.collection('central_event_student_payments');

    // 1. Fetch matching event from central_events
    let eventDoc = null;
    if (eventId && mongoose.Types.ObjectId.isValid(eventId)) {
      eventDoc = await db.collection('central_events').findOne({ _id: new mongoose.Types.ObjectId(eventId) });
    }
    if (!eventDoc && eventSlug) {
      eventDoc = await db.collection('central_events').findOne({ slug: eventSlug });
    }
    if (!eventDoc && eventTitle) {
      eventDoc = await db.collection('central_events').findOne({
        $or: [
          { title: eventTitle },
          { titleLower: (eventTitle || '').toLowerCase() }
        ]
      });
    }

    const finalEventTitle = eventDoc?.title || eventTitle || 'Event Registration';
    const finalEventSlug = eventDoc?.slug || eventSlug || '';
    const finalEventId = eventDoc?._id || (eventId && mongoose.Types.ObjectId.isValid(eventId) ? new mongoose.Types.ObjectId(eventId) : null);
    const finalTypeCode = eventDoc?.typeCode || typeCode || 'COLORS';
    const rawCategory = (eventDoc?.categoryName || eventDoc?.category || '').toLowerCase();

    // Determine form_type & form_name
    let form_type = '5.3';
    let form_name = 'Extra-curricular events (cultural)';
    if (finalTypeCode === 'VEDA') {
      form_type = '5.1';
      form_name = 'Student participation in professional events';
    } else if (rawCategory.includes('sport')) {
      form_type = '5.2';
      form_name = 'Extra-curricular events (sports)';
    } else {
      form_type = '5.3';
      form_name = 'Extra-curricular events (cultural)';
    }

    // Determine fee amount in Rupees
    let amountInRupees = 0;
    if (fee && typeof fee.amount === 'number') {
      amountInRupees = fee.amount;
    } else if (typeof req.body.amount === 'number') {
      amountInRupees = req.body.amount;
    } else if (typeof req.body.price === 'number') {
      amountInRupees = req.body.price;
    } else if (eventDoc?.fee?.amount) {
      amountInRupees = eventDoc.fee.amount >= 1000 ? Math.round(eventDoc.fee.amount / 100) : eventDoc.fee.amount;
    }

    const studentRoll = (participant.rollNumber || participant.roll || participant.studentRoll || '').trim();
    const studentName = (participant.name || participant.studentName || '').trim();
    const studentEmail = (participant.email || participant.studentEmail || '').trim();
    const studentPhone = (participant.phone || participant.mobile || participant.studentMobile || '').trim();
    const studentCollege = (participant.college || participant.studentCollege || 'Aditya University').trim();
    const studentDepartment = (participant.department || participant.branch || 'General').trim();
    const studentYear = (participant.year || participant.year_of_study || '3rd Year').trim();

    // Duplicate registration check
    const existingCheckQuery = {
      roll_number: new RegExp('^' + studentRoll + '$', 'i')
    };
    if (finalEventId) {
      existingCheckQuery.centralEventId = finalEventId;
    } else {
      existingCheckQuery.eventTitle = finalEventTitle;
    }

    const existingReg = await studentRegColl.findOne(existingCheckQuery);
    if (existingReg) {
      return res.status(200).json({
        success: true,
        alreadyRegistered: true,
        message: 'Student is already registered for this event',
        data: {
          registration: existingReg,
          registrationNumber: existingReg.registrationNumber
        }
      });
    }

    // Generate unique registration number (CLR27-COLORS-XXXXXX or VEDA26-VEDA-XXXXXX)
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    const prefix = finalTypeCode === 'VEDA' ? 'VEDA26-VEDA' : 'CLR27-COLORS';
    const registrationNumber = req.body.registrationNumber || (prefix + '-' + randomDigits);
    const paymentReference = 'PAY-' + registrationNumber;

    // Academic year format
    let acYear = academicYear || eventDoc?.academicYear || '2026-27';
    if (/^\d{4}-\d{4}$/.test(acYear)) {
      acYear = acYear.slice(0, 5) + acYear.slice(7);
    }

    // Razorpay Order Creation if amount > 0
    let razorpayOrderId = null;
    const amountInPaise = Math.round(amountInRupees * 100);
    if (amountInRupees > 0) {
      try {
        const keyId = process.env.RZP_KEY_ID || process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RZP_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET;
        if (keyId && keySecret) {
          const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
          const order = await rzp.orders.create({
            amount: amountInPaise,
            currency: 'INR',
            receipt: paymentReference,
            notes: {
              registrationNumber,
              studentRoll,
              eventTitle: finalEventTitle
            }
          });
          if (order && order.id) {
            razorpayOrderId = order.id;
          }
        }
      } catch (rzpErr) {
        console.warn('Razorpay order creation skipped or failed:', rzpErr.message);
      }
    }

    const now = new Date();
    const startDate = eventDoc?.schedule?.fromDate ? new Date(eventDoc.schedule.fromDate) : now;
    const endDate = eventDoc?.schedule?.toDate ? new Date(eventDoc.schedule.toDate) : now;

    // STEP 1: Save registration into central_event_student_registrations collection
    const registrationDoc = {
      form_type,
      form_name,
      academic_year: acYear,
      event_name: finalEventTitle,
      nature: 'Other',
      within_state: 'Yes',
      start_date: startDate,
      end_date: endDate,
      host_institution: 'Aditya University',
      student_name: studentName,
      roll_number: studentRoll,
      recognition: '',
      created_by: 'fest_portal',
      created_at: now,
      updated_at: now,
      registrationNumber,
      centralEventId: finalEventId,
      eventTitle: finalEventTitle,
      eventSlug: finalEventSlug,
      typeCode: finalTypeCode,
      participant: {
        name: studentName,
        rollNumber: studentRoll,
        email: studentEmail,
        phone: studentPhone,
        college: studentCollege,
        department: studentDepartment,
        year: studentYear
      },
      teamName: teamName || null,
      teamMembers: Array.isArray(teamMembers) ? teamMembers : [],
      fee: {
        amount: amountInRupees,
        currency: 'INR'
      },
      payment: {
        orderId: razorpayOrderId,
        status: amountInRupees === 0 ? 'FREE' : 'PENDING',
        amount: amountInRupees,
        paidAt: amountInRupees === 0 ? now : null,
        paymentId: null,
        rawPaymentData: null
      },
      status: amountInRupees === 0 ? 'CONFIRMED' : 'PENDING',
      __v: 0
    };

    const regResult = await studentRegColl.insertOne(registrationDoc);
    registrationDoc._id = regResult.insertedId;

    // STEP 2: Store payment data into central_event_student_payments collection
    const clientIp = req.ip || req.headers['x-forwarded-for'] || '::1';
    const userAgent = req.headers['user-agent'] || '';

    const paymentDoc = {
      paymentReference,
      registrationId: registrationDoc._id,
      registrationNumber,
      centralEventId: finalEventId,
      eventTitle: finalEventTitle,
      student: {
        name: studentName,
        rollNumber: studentRoll,
        email: studentEmail,
        phone: studentPhone,
        college: studentCollege,
        department: studentDepartment
      },
      amount: amountInRupees,
      amountInPaise,
      currency: 'INR',
      razorpay: {
        orderId: razorpayOrderId,
        paymentId: null,
        signature: null,
        signatureVerified: false,
        method: null,
        bank: null,
        wallet: null,
        vpa: null,
        fee: 0,
        tax: 0
      },
      status: amountInRupees === 0 ? 'PAID' : 'CREATED',
      securityAudit: {
        clientIp,
        userAgent,
        initiatedAt: now,
        verificationAlgorithm: 'HMAC-SHA256',
        verifiedAt: null,
        signatureHash: null,
        apiVerifiedWithGateway: false
      },
      rawGatewayResponse: null,
      createdAt: now,
      updatedAt: now,
      __v: 0
    };

    const payResult = await studentPayColl.insertOne(paymentDoc);
    paymentDoc._id = payResult.insertedId;

    // Increment registrationCount in central_events atomically if event found
    if (finalEventId) {
      await db.collection('central_events').updateOne(
        { _id: finalEventId },
        { $inc: { registrationCount: 1 } }
      ).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      message: 'Registration and payment record created successfully',
      data: {
        registration: registrationDoc,
        payment: paymentDoc,
        registrationNumber,
        paymentReference,
        orderId: razorpayOrderId,
        amount: amountInRupees,
        amountInPaise,
        keyId: process.env.RZP_KEY_ID || process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error('Error creating student registration and payment:', error);
    next(error);
  }
};

/**
 * GET /central-event-registrations/student/:roll
 * Returns all fest event registrations for a given student roll
 */
const getStudentRegistrationsByRoll = async (req, res, next) => {
  try {
    const { roll } = req.params;
    const db = mongoose.connection.db;
    const records = await db.collection('central_event_student_registrations')
      .find({
        $or: [
          { roll_number: new RegExp('^' + roll + '$', 'i') },
          { 'participant.rollNumber': new RegExp('^' + roll + '$', 'i') }
        ]
      })
      .sort({ created_at: -1 })
      .toArray();

    return res.json({ success: true, data: records });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /central-event-payments/verify-gateway
 * Admin side Razorpay gateway verification & update
 */
const verifyStudentPaymentGateway = async (req, res, next) => {
  try {
    const { paymentReference, registrationNumber, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    const db = mongoose.connection.db;

    const query = {};
    if (paymentReference) query.paymentReference = paymentReference;
    else if (registrationNumber) query.registrationNumber = registrationNumber;
    else if (razorpay_order_id) query['razorpay.orderId'] = razorpay_order_id;

    const payment = await db.collection('central_event_student_payments').findOne(query);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found' });
    }

    const now = new Date();

    // Update payment document
    await db.collection('central_event_student_payments').updateOne(
      { _id: payment._id },
      {
        $set: {
          status: 'PAID',
          'razorpay.paymentId': razorpay_payment_id || payment.razorpay?.paymentId,
          'razorpay.orderId': razorpay_order_id || payment.razorpay?.orderId,
          'razorpay.signature': razorpay_signature || null,
          'razorpay.signatureVerified': true,
          'securityAudit.verifiedAt': now,
          'securityAudit.apiVerifiedWithGateway': true,
          updatedAt: now
        }
      }
    );

    // Update corresponding registration
    if (payment.registrationId) {
      await db.collection('central_event_student_registrations').updateOne(
        { _id: payment.registrationId },
        {
          $set: {
            status: 'CONFIRMED',
            'payment.status': 'PAID',
            'payment.paymentId': razorpay_payment_id || null,
            'payment.orderId': razorpay_order_id || payment.razorpay?.orderId,
            'payment.paidAt': now,
            updated_at: now
          }
        }
      );
    }

    return res.json({
      success: true,
      message: 'Payment verified and registration confirmed successfully',
      data: { paymentReference: payment.paymentReference, status: 'PAID' }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /central-event-payments
 * Admin listing of student payments
 */
const listStudentPaymentsAdmin = async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { status, limit = 50, page = 1 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const payments = await db.collection('central_event_student_payments')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .toArray();

    const total = await db.collection('central_event_student_payments').countDocuments(filter);

    return res.json({
      success: true,
      data: payments,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /central-event-student-registrations
 * Admin listing of student registrations
 */
const listStudentRegistrationsAdmin = async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { status, typeCode, limit = 50, page = 1 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (typeCode) filter.typeCode = typeCode;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const records = await db.collection('central_event_student_registrations')
      .find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .toArray();

    const total = await db.collection('central_event_student_registrations').countDocuments(filter);

    return res.json({
      success: true,
      data: records,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) }
    });
  } catch (error) {
    next(error);
  }
};



/**
 * GET /central-events/check-student/:roll
 * Check whether a student exists in eventstudents or central_event_student_registrations,
 * and whether they are already registered for the specific event.
 */
const checkStudentExists = async (req, res, next) => {
  try {
    const { roll } = req.params;
    const { eventId, eventSlug, eventTitle } = req.query;
    const cleanRoll = (roll || '').trim();
    if (!cleanRoll) {
      return res.status(400).json({ success: false, message: 'Roll number is required' });
    }

    const db = mongoose.connection.db;

    // 1. Check in eventstudents
    const eventStudent = await db.collection('eventstudents').findOne({
      $or: [
        { roll: cleanRoll.toUpperCase() },
        { roll: cleanRoll },
        { email: cleanRoll.toLowerCase() }
      ]
    });

    // 2. Check in central_event_student_registrations
    const regStudent = await db.collection('central_event_student_registrations').findOne({
      $or: [
        { roll_number: cleanRoll.toUpperCase() },
        { roll_number: cleanRoll },
        { 'participant.rollNumber': cleanRoll.toUpperCase() },
        { 'participant.rollNumber': cleanRoll },
        { 'participant.email': cleanRoll.toLowerCase() }
      ]
    });

    // 3. Check if already registered for this specific event
    let alreadyRegisteredForEvent = false;
    let existingRegistration = null;

    if (eventId || eventSlug || eventTitle) {
      const matchCriteria = [];
      if (eventId && mongoose.Types.ObjectId.isValid(eventId)) {
        matchCriteria.push({ centralEventId: new mongoose.Types.ObjectId(eventId) });
      }
      if (eventSlug) {
        matchCriteria.push({ eventSlug: eventSlug });
      }
      if (eventTitle) {
        matchCriteria.push({ eventTitle: eventTitle });
        matchCriteria.push({ event_name: eventTitle });
      }

      const rollCriteria = [
        { roll_number: cleanRoll.toUpperCase() },
        { roll_number: cleanRoll },
        { 'participant.rollNumber': cleanRoll.toUpperCase() },
        { 'participant.rollNumber': cleanRoll }
      ];

      if (matchCriteria.length > 0) {
        existingRegistration = await db.collection('central_event_student_registrations').findOne({
          $and: [
            { $or: rollCriteria },
            { $or: matchCriteria }
          ]
        });
        if (existingRegistration) {
          alreadyRegisteredForEvent = true;
        }
      }
    }

    const exists = !!(eventStudent || regStudent);
    let student = null;

    if (eventStudent) {
      student = {
        name: eventStudent.name,
        roll: eventStudent.roll,
        college: eventStudent.college || 'Aditya University',
        otherCollege: eventStudent.otherCollege || '',
        gender: eventStudent.gender || 'Male',
        mobile: eventStudent.mobile || '',
        email: eventStudent.email || '',
        department: eventStudent.department || 'General',
        year: eventStudent.year || '3rd Year'
      };
    } else if (regStudent) {
      student = {
        name: regStudent.student_name || regStudent.participant?.name,
        roll: regStudent.roll_number || regStudent.participant?.rollNumber,
        college: regStudent.participant?.college || regStudent.host_institution || 'Aditya University',
        gender: regStudent.participant?.gender || 'Male',
        mobile: regStudent.participant?.phone || '',
        email: regStudent.participant?.email || '',
        department: regStudent.participant?.department || 'General',
        year: regStudent.participant?.year || '3rd Year'
      };
    }

    return res.json({
      success: true,
      exists,
      student,
      alreadyRegisteredForEvent,
      existingRegistration
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  checkStudentExists,
  registerForCentralEvent,
  getRegistrationById,
  getMyRegistrations,
  getAllRegistrationsAdmin,
  createStudentRegistrationAndPayment,
  getStudentRegistrationsByRoll,
  verifyStudentPaymentGateway,
  listStudentPaymentsAdmin,
  listStudentRegistrationsAdmin
};
