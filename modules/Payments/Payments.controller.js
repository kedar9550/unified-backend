const paymentsService = require('./Payments.service');
const PaymentRegistration = require('./PaymentRegistration.model');

exports.createOrder = async (req, res) => {
  try {
    const { amount: frontendAmount, eventId, teamSize, extraTeamSize, currency, receipt, participants, teamId, category: reqCategory } = req.body;
    let amountInPaisa = 0;

    if (eventId) {
      const Events = require('../Events/Events.model');
      const event = await Events.findById(eventId);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      const baseAmount = Number(event.price) || 0;
      const extraPerHead = Number(event.extraAmountPerHead) || 0;
      const tSize = Number(teamSize) || 1;
      const eSize = Number(extraTeamSize) || 0;

      let totalBase = baseAmount;
      if (event.priceType && event.priceType.toLowerCase() === 'per head') {
        totalBase = baseAmount * tSize;
      }
      const totalAmount = totalBase + (eSize * extraPerHead);

      amountInPaisa = Math.round(totalAmount * 100);
    } else {
      amountInPaisa = Number(frontendAmount);
    }

    if (!amountInPaisa || typeof amountInPaisa !== 'number' || amountInPaisa <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const order = await paymentsService.createOrder({ amount: amountInPaisa, currency, receipt });

    try {
      let eventName = '';
      let category = '';
      if (eventId) {
        const Events = require('../Events/Events.model');
        const event = await Events.findById(eventId);
        if (event) {
          eventName = event.eventName;
          category = event.category || event.groupCategory || '';
        }
      }

      const participantsData = (Array.isArray(participants) ? participants : []).map(p => ({
        ...p,
        accommodation: p.accommodation || "No",
      }));

      const registration = new PaymentRegistration({
        eventId: eventId || '',
        eventName: eventName,
        category: reqCategory || category,
        amount: amountInPaisa / 100,
        amountRupees: amountInPaisa / 100,
        currency: currency || 'INR',
        teamId: teamId || '',
        teamSize: Number(teamSize) || 1,
        participants: participantsData,
        razorpayOrderId: order.id,
        razorpayPaymentId: 'PENDING',
        razorpaySignature: 'PENDING',
        paymentStatus: 'PENDING',
        verified: false,
      });
      await registration.save();
    } catch (err) {
      console.error('Error creating pending registration:', err);
    }

    return res.json({ orderId: order.id, order, amountInPaisa });
  } catch (err) {
    console.error('Payments.createOrder error', err);
    return res.status(500).json({ error: 'Unable to create order', details: err.message });
  }
};

const getRoleFilterQuery = async (req) => {
  const activeRole = req.headers['active-role'];
  if (!activeRole) return {};

  const role = String(activeRole).toUpperCase().trim();
  // Unrestricted admin roles
  if (['STUDENT_EVENT_ADMIN', 'STUDENT EVENT ADMIN', 'VEDA_ADMIN', 'VEDA ADMIN', 'ADMIN', 'SUPER_ADMIN', 'MANAGEMENT', 'DEVELOPER'].includes(role)) {
    return {};
  }

  const jwt = require('jsonwebtoken');
  const token = (req.headers.authorization && req.headers.authorization.split(' ')[1]) || req.cookies?.token;
  if (!token) return {};

  let empId = null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    empId = decoded.institutionId || decoded.employeeId || decoded.employeeCode || decoded.id || decoded.userId;
    if (empId) empId = String(empId).trim();
  } catch (err) {
    console.error('Error decoding token for role filter', err);
    return {};
  }

  if (!empId) return {};

  const empIdNum = Number(empId);
  const empMatch = isNaN(empIdNum) ? [empId] : [empId, empIdNum];

  const EventSchools = require('../EventSchools/EventSchools.model');
  const Events = require('../Events/Events.model');

  if (role === 'SCHOOL_COORDINATOR' || role === 'EVENT_COORDINATOR') {
    // 1. Find all schools where coordinator is this employee
    const mySchools = await EventSchools.find({
      $or: [
        { 'coordinators.employeeId': { $in: empMatch } },
        { 'coordinator.employeeId': { $in: empMatch } }
      ]
    }).lean();

    const schoolIds = mySchools.map(s => s._id.toString());
    const schoolNames = mySchools.map(s => s.name).filter(Boolean);
    const schoolShortNames = mySchools.map(s => s.shortName).filter(Boolean);

    // 2. Find all events under these schools OR where coordinator is convener / faculty coordinator
    const myEvents = await Events.find({
      $or: [
        { eventSchool: { $in: mySchools.map(s => s._id) } },
        { 'conveners.employeeId': { $in: empMatch } },
        { 'facultyCoordinators.employeeId': { $in: empMatch } },
        { 'facultyCoordinator.employeeId': { $in: empMatch } }
      ]
    }).lean();

    const eventIds = myEvents.map(e => e._id.toString());
    const eventNames = myEvents.map(e => e.eventName).filter(Boolean);

    const orConditions = [];

    // Match by school IDs (string or ObjectId)
    if (schoolIds.length > 0) {
      orConditions.push({ schoolId: { $in: schoolIds } });
    }

    // Match by school names/shortNames in schoolId or category
    const schoolNameRegexes = [...new Set([...schoolNames, ...schoolShortNames])].map(
      name => new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    );
    if (schoolNameRegexes.length > 0) {
      orConditions.push({ schoolId: { $in: schoolNameRegexes } });
      orConditions.push({ category: { $in: schoolNameRegexes } });
    }

    // Match by event IDs
    if (eventIds.length > 0) {
      orConditions.push({ eventId: { $in: eventIds } });
    }

    // Match by event names in eventName or category
    const eventNameRegexes = [...new Set(eventNames)].map(
      name => new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    );
    if (eventNameRegexes.length > 0) {
      orConditions.push({ eventName: { $in: eventNameRegexes } });
      orConditions.push({ category: { $in: eventNameRegexes } });
    }

    if (orConditions.length === 0) {
      return { _id: null };
    }

    return { $or: orConditions };
  }

  if (role === 'FACULTY_COORDINATOR' || role === 'CONVENER') {
    const myEvents = await Events.find({
      $or: [
        { 'conveners.employeeId': { $in: empMatch } },
        { 'facultyCoordinators.employeeId': { $in: empMatch } },
        { 'facultyCoordinator.employeeId': { $in: empMatch } }
      ]
    }).lean();

    const eventIds = myEvents.map(e => e._id.toString());
    const eventNames = myEvents.map(e => e.eventName).filter(Boolean);

    const orConditions = [];
    if (eventIds.length > 0) {
      orConditions.push({ eventId: { $in: eventIds } });
    }
    const eventNameRegexes = [...new Set(eventNames)].map(
      name => new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    );
    if (eventNameRegexes.length > 0) {
      orConditions.push({ eventName: { $in: eventNameRegexes } });
      orConditions.push({ category: { $in: eventNameRegexes } });
    }

    if (orConditions.length === 0) {
      return { _id: null };
    }

    return { $or: orConditions };
  }

  return {};
};

exports.getRegistrations = async (req, res) => {
  try {
    const { email, roll, teamId, paymentStatus, payment, search } = req.query;
    const andConditions = [];

    const statusFilter = paymentStatus || payment;
    if (statusFilter && statusFilter.trim()) {
      const cleanStatus = statusFilter.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      andConditions.push({
        $or: [
          { paymentStatus: { $regex: new RegExp(`^${cleanStatus}$`, "i") } },
          { payment: { $regex: new RegExp(`^${cleanStatus}$`, "i") } }
        ]
      });
    }

    const roleFilter = await getRoleFilterQuery(req);
    if (Object.keys(roleFilter).length > 0) {
      andConditions.push(roleFilter);
    }

    if (teamId && teamId.trim()) {
      const cleanTeamId = teamId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      andConditions.push({ teamId: { $regex: new RegExp(`^\\s*${cleanTeamId}\\s*$`, 'i') } });
    }

    if (search && search.trim()) {
      const cleanSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(cleanSearch, 'i');
      andConditions.push({
        $or: [
          { 'participants.name': searchRegex },
          { 'participants.roll': searchRegex },
          { 'participants.email': searchRegex },
          { 'participants.mobile': searchRegex },
          { receipt: searchRegex },
          { eventName: searchRegex },
          { category: searchRegex }
        ]
      });
    } else {
      if (email && email.trim() && roll && roll.trim()) {
        const cleanEmail = email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const cleanRoll = roll.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        andConditions.push({
          $or: [
            { 'participants.roll': { $regex: new RegExp(`^\\s*${cleanRoll}\\s*$`, 'i') } },
            { 'participants.email': { $regex: new RegExp(`^\\s*${cleanEmail}\\s*$`, 'i') } }
          ]
        });
      } else if (email && email.trim()) {
        const cleanEmail = email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        andConditions.push({ 'participants.email': { $regex: new RegExp(`^\\s*${cleanEmail}\\s*$`, 'i') } });
      } else if (roll && roll.trim()) {
        const cleanRoll = roll.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        andConditions.push({ 'participants.roll': { $regex: new RegExp(`^\\s*${cleanRoll}\\s*$`, 'i') } });
      }
    }

    const finalQuery = andConditions.length > 0 ? { $and: andConditions } : {};
    let payments = await PaymentRegistration.find(finalQuery).sort({ createdAt: -1 }).lean();

    return res.json({ payments });
  } catch (err) {
    console.error('Payments.getRegistrations error', err);
    return res.status(500).json({ error: 'Unable to fetch payment registrations', details: err.message });
  }
};

exports.getPasses = async (req, res) => {
  Object.defineProperty(req, 'query', {
    value: { ...(req.query || {}), paymentStatus: 'PAID' },
    writable: true,
    configurable: true
  });
  return exports.getRegistrations(req, res);
};

exports.deleteRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const registration = await PaymentRegistration.findById(id);
    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    await PaymentRegistration.findByIdAndDelete(id);
    return res.json({ ok: true, message: 'Registration deleted successfully' });
  } catch (err) {
    console.error('deleteRegistration error', err);
    return res.status(500).json({ error: 'Unable to delete registration', details: err.message });
  }
};

exports.addParticipants = async (req, res) => {
  try {
    const { id } = req.params;
    const { participants, eventName, category } = req.body;

    const registration = await PaymentRegistration.findById(id);
    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    const participantsData = (Array.isArray(participants) ? participants : []).map(p => ({
      ...p,
      accommodation: p.accommodation || "No",
      barcode: p.barcode || require('crypto').randomBytes(4).toString('hex').toUpperCase()
    }));

    // Generate a teamId if it doesn't have one
    let newTeamId = registration.teamId;
    if (!newTeamId || newTeamId.trim() === '-' || newTeamId.trim() === '') {
      newTeamId = `VD26-${require('crypto').randomBytes(3).toString('hex').toUpperCase()}`;
    }

    registration.participants = participantsData;
    registration.teamId = newTeamId;
    registration.eventName = eventName || registration.eventName;
    registration.category = category || registration.category;
    registration.teamSize = participantsData.length;

    await registration.save();
    return res.json({ ok: true, message: 'Participants added successfully', teamId: newTeamId });
  } catch (err) {
    console.error('addParticipants error', err);
    return res.status(500).json({ error: 'Unable to add participants', details: err.message });
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
      teamId,
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

    const participantsData = (Array.isArray(participants) ? participants : []).map(p => ({
      ...p,
      accommodation: p.accommodation || "No",
      barcode: require('crypto').randomBytes(4).toString('hex').toUpperCase()
    }));

    const rawPaymentUpdate = fetchedPayment
      ? { ...(rawPaymentData || req.body), razorpayCompleteResponse: fetchedPayment }
      : (rawPaymentData || req.body);

    const registration = await PaymentRegistration.findOneAndUpdate(
      { razorpayOrderId: order_id },
      {
        $set: {
          eventId: eventId || '',
          schoolId: schoolId || '',
          category: category || '',
          eventName: eventName || '',
          amount: amountValue,
          amountRupees: amountValue,
          currency,
          teamId: teamId || '',
          teamSize: Number(teamSize) || 1,
          participants: participantsData,
          receipt: receipt || '',
          razorpayPaymentId: payment_id,
          razorpaySignature: signature,
          paymentStatus: 'PAID',
          verified: true,
          rawPaymentData: rawPaymentUpdate,
        }
      },
      { new: true, upsert: true }
    );

    // Send invoice email asynchronously
    try {
      const eventsController = require('../Events/Events.controller');
      const emailPayload = {
        email: (Array.isArray(participants) && participants[0]?.email) ? participants[0].email : '',
        invoiceId: `INV/${new Date().getFullYear()}/${registration._id.toString().substring(18)}`.toUpperCase(),
        invoiceDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
        eventName: eventName || '',
        teamSize: Number(teamSize) || 1,
        amountPaid: amountValue,
        participants: Array.isArray(participants) ? participants : [],
      };

      if (emailPayload.email) {
        // Send email in the background to not block the response
        eventsController.sendInvoiceMailInternal(emailPayload).catch(e => {
          console.error('Background invoice email failed:', e);
        });
      }
    } catch (mailErr) {
      console.error('Failed to initiate invoice mail after payment', mailErr);
    }

    return res.status(201).json({ ok: true, registrationId: registration._id });
  } catch (err) {
    console.error('Payments.verifyPayment error', err);
    return res.status(500).json({ error: 'Unable to verify payment', details: err.message });
  }
};

exports.manualApprovePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const registration = await PaymentRegistration.findById(id);
    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    registration.paymentStatus = 'PAID';
    registration.verified = true;
    registration.razorpayPaymentId = 'MANUAL_APPROVAL';

    // Auto-generate barcodes for participants if missing
    if (Array.isArray(registration.participants)) {
      registration.participants.forEach(p => {
        if (!p.barcode) {
          p.barcode = require('crypto').randomBytes(4).toString('hex').toUpperCase();
        }
      });
    }

    await registration.save();
    return res.json({ ok: true, message: 'Payment manually approved', registration });
  } catch (err) {
    console.error('manualApprovePayment error', err);
    return res.status(500).json({ error: 'Unable to manually approve', details: err.message });
  }
};

exports.verifyGatewayPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const registration = await PaymentRegistration.findById(id);
    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    if (!registration.razorpayOrderId) {
      return res.status(400).json({ error: 'No Razorpay Order ID to verify' });
    }

    // Try fetching order payments from razorpay
    const paymentsService = require('./Payments.service');
    const Razorpay = require('razorpay');
    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const orderPayments = await instance.orders.fetchPayments(registration.razorpayOrderId);

    if (orderPayments && orderPayments.items && orderPayments.items.length > 0) {
      // Find a captured or authorized payment
      const successfulPayment = orderPayments.items.find(p => p.status === 'captured' || p.status === 'authorized');

      if (successfulPayment) {
        registration.paymentStatus = 'PAID';
        registration.verified = true;
        registration.razorpayPaymentId = successfulPayment.id;
        registration.rawPaymentData = { ...registration.rawPaymentData, razorpayCompleteResponse: successfulPayment };

        if (Array.isArray(registration.participants)) {
          registration.participants.forEach(p => {
            if (!p.barcode) {
              p.barcode = require('crypto').randomBytes(4).toString('hex').toUpperCase();
            }
          });
        }
        await registration.save();
        return res.json({ ok: true, status: 'PAID', message: 'Payment verified successfully from gateway', registration });
      } else {
        return res.json({ ok: true, status: 'PENDING', message: 'Gateway shows payment as failed or pending' });
      }
    }
    return res.json({ ok: true, status: 'PENDING', message: 'No successful payment found on gateway' });
  } catch (err) {
    console.error('verifyGatewayPayment error', err);
    return res.status(500).json({ error: 'Unable to verify from gateway', details: err.message });
  }
};

exports.triggerVerifyAllPendingGateway = async (req, res) => {
  try {
    const { verifyAllPendingOrders } = require('./paymentVerification.cron');
    const limit = Number(req.query.limit) || Number(req.body?.limit) || 100;
    const summary = await verifyAllPendingOrders({ limit, delayMs: 150 });
    return res.json({ ok: true, summary });
  } catch (err) {
    console.error('triggerVerifyAllPendingGateway error', err);
    return res.status(500).json({ error: 'Failed to execute batch gateway verification', details: err.message });
  }
};

exports.getStudentBranch = async (req, res) => {
  try {
    const { roll } = req.params;
    const response = await fetch(`https://info.aec.edu.in/adityaapi/api/studentdata/${roll}`);
    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error('Error fetching student branch:', err.message);
    return res.status(500).json({ error: 'Failed to fetch from Aditya API', details: err.message });
  }
};

exports.getRazorpayPaymentDetails = async (req, res) => {
  try {
    const { paymentId } = req.params;
    if (!paymentId || !paymentId.trim()) {
      return res.status(400).json({ error: 'Payment ID is required' });
    }

    const cleanPaymentId = paymentId.trim();

    // Check if registration already exists in database
    const existingRegistration = await PaymentRegistration.findOne({
      $or: [
        { razorpayPaymentId: cleanPaymentId },
        { razorpayOrderId: cleanPaymentId }
      ]
    }).lean();

    // Fetch from Razorpay
    const Razorpay = require('razorpay');
    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    let paymentData = null;
    let foundOnGateway = false;
    try {
      if (cleanPaymentId.startsWith('order_')) {
        const orderPayments = await instance.orders.fetchPayments(cleanPaymentId);
        if (orderPayments && orderPayments.items && orderPayments.items.length > 0) {
          paymentData = orderPayments.items.find(p => p.status === 'captured' || p.status === 'authorized') || orderPayments.items[0];
          foundOnGateway = true;
        }
      } else {
        paymentData = await instance.payments.fetch(cleanPaymentId);
        foundOnGateway = true;
      }
    } catch (rzpErr) {
      console.warn('Razorpay fetch warning:', rzpErr.message);
      if (existingRegistration) {
        return res.json({
          ok: true,
          foundOnGateway: false,
          payment: {
            id: existingRegistration.razorpayPaymentId,
            order_id: existingRegistration.razorpayOrderId,
            amount: Math.round((existingRegistration.amountRupees || existingRegistration.amount || 0) * 100),
            currency: existingRegistration.currency || 'INR',
            status: existingRegistration.paymentStatus?.toLowerCase() || 'captured',
            created_at: existingRegistration.paidAt ? Math.floor(new Date(existingRegistration.paidAt).getTime() / 1000) : null,
          },
          existingRegistration,
          fromDatabaseOnly: true
        });
      }

      // If not on gateway, allow manual entry with warning instead of blocking the user
      return res.json({
        ok: true,
        foundOnGateway: false,
        warning: `Payment ID not found on active Razorpay account (${rzpErr.error?.description || rzpErr.message || 'The id provided does not exist'}). You can enter amount details and proceed with manual mapping.`,
        payment: {
          id: cleanPaymentId,
          order_id: '',
          amount: 0,
          currency: 'INR',
          status: 'PAID',
          created_at: Math.floor(Date.now() / 1000),
          isManualOverride: true
        },
        existingRegistration: null
      });
    }

    if (!paymentData) {
      return res.json({
        ok: true,
        foundOnGateway: false,
        warning: 'Payment not found on Razorpay. You can enter amount details and proceed manually.',
        payment: {
          id: cleanPaymentId,
          order_id: '',
          amount: 0,
          currency: 'INR',
          status: 'PAID',
          created_at: Math.floor(Date.now() / 1000),
          isManualOverride: true
        },
        existingRegistration: existingRegistration || null
      });
    }

    return res.json({
      ok: true,
      foundOnGateway: true,
      payment: paymentData,
      existingRegistration
    });
  } catch (err) {
    console.error('getRazorpayPaymentDetails error:', err);
    return res.status(500).json({ error: 'Server error retrieving payment details', details: err.message });
  }
};

exports.manualAddRegistration = async (req, res) => {
  try {
    const {
      paymentId,
      orderId,
      eventId,
      schoolId,
      category,
      eventName,
      teamSize,
      amount,
      amountRupees,
      currency = 'INR',
      participants = []
    } = req.body;

    if (!paymentId || !paymentId.trim()) {
      return res.status(400).json({ error: 'Payment ID is required' });
    }
    if (!eventId) {
      return res.status(400).json({ error: 'Event must be selected' });
    }
    if (!Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ error: 'At least one participant is required' });
    }

    const cleanPaymentId = paymentId.trim();

    // Check if already registered
    let existing = await PaymentRegistration.findOne({
      $or: [
        { razorpayPaymentId: cleanPaymentId },
        ...(orderId ? [{ razorpayOrderId: orderId.trim() }] : [])
      ]
    });

    // Attempt to fetch fresh payment info from Razorpay
    let fetchedPayment = null;
    try {
      const paymentsService = require('./Payments.service');
      fetchedPayment = await paymentsService.fetchPayment(cleanPaymentId);
    } catch (rzpErr) {
      console.warn('Could not re-fetch from Razorpay, using provided info:', rzpErr.message);
    }

    const parsedAmount = fetchedPayment
      ? fetchedPayment.amount / 100
      : Number(amountRupees ?? amount ?? 0);

    const crypto = require('crypto');
    const participantsData = participants.map(p => ({
      name: p.name ? p.name.trim() : '',
      college: p.college || 'Aditya University',
      otherCollege: p.college === 'Other College' ? (p.otherCollege ? p.otherCollege.trim() : '') : '',
      roll: p.roll ? p.roll.trim().toUpperCase() : '',
      gender: p.gender || 'Other',
      mobile: p.mobile ? String(p.mobile).trim() : '',
      email: p.email ? p.email.trim().toLowerCase() : '',
      year: p.year ? String(p.year).trim() : '',
      department: p.department ? p.department.trim() : '',
      branch: p.branch ? p.branch.trim() : '',
      location: p.location ? p.location.trim() : '',
      accommodation: p.accommodation || 'No',
      barcode: p.barcode || crypto.randomBytes(4).toString('hex').toUpperCase(),
      attended: p.attended || false,
      scanCount: p.scanCount || 0
    }));

    // Generate unique team ID (VD26-XXXXXX) if not present
    let teamId = existing?.teamId;
    if (!teamId || teamId.trim() === '' || teamId.trim() === '-') {
      teamId = `VD26-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    }

    const receipt = existing?.receipt || `event-${eventId}-${Date.now()}`;
    const resolvedOrderId = fetchedPayment?.order_id || orderId || existing?.razorpayOrderId || `order_manual_${Date.now()}`;

    const rawPaymentUpdate = fetchedPayment
      ? { razorpayCompleteResponse: fetchedPayment, manuallyAdded: true, manuallyAddedAt: new Date() }
      : { manuallyAdded: true, manuallyAddedAt: new Date(), ...(existing?.rawPaymentData || {}) };

    let registration;
    if (existing) {
      existing.eventId = eventId;
      existing.schoolId = schoolId || existing.schoolId;
      existing.category = category || existing.category;
      existing.eventName = eventName || existing.eventName;
      existing.amount = parsedAmount;
      existing.amountRupees = parsedAmount;
      existing.currency = currency;
      existing.teamId = teamId;
      existing.teamSize = Number(teamSize) || participantsData.length;
      existing.participants = participantsData;
      existing.receipt = receipt;
      existing.razorpayOrderId = resolvedOrderId;
      existing.razorpayPaymentId = cleanPaymentId;
      existing.razorpaySignature = 'MANUAL_ADD_VERIFIED';
      existing.paymentStatus = 'PAID';
      existing.verified = true;
      existing.rawPaymentData = rawPaymentUpdate;
      if (fetchedPayment?.created_at) {
        existing.paidAt = new Date(fetchedPayment.created_at * 1000);
      }
      registration = await existing.save();
    } else {
      registration = await PaymentRegistration.create({
        eventId,
        schoolId,
        category,
        eventName,
        amount: parsedAmount,
        amountRupees: parsedAmount,
        currency,
        teamId,
        teamSize: Number(teamSize) || participantsData.length,
        participants: participantsData,
        receipt,
        razorpayOrderId: resolvedOrderId,
        razorpayPaymentId: cleanPaymentId,
        razorpaySignature: 'MANUAL_ADD_VERIFIED',
        paymentStatus: 'PAID',
        verified: true,
        paidAt: fetchedPayment?.created_at ? new Date(fetchedPayment.created_at * 1000) : new Date(),
        rawPaymentData: rawPaymentUpdate,
      });
    }

    // Upsert participants into EventStudent for login/profile access
    try {
      const EventStudent = require('../EventStudents/EventStudent.model');
      for (const p of participantsData) {
        if (p.roll && p.email && p.name) {
          await EventStudent.findOneAndUpdate(
            { roll: p.roll },
            {
              $set: {
                name: p.name,
                college: p.college,
                otherCollege: p.otherCollege,
                gender: p.gender,
                mobile: p.mobile,
                email: p.email,
              },
              $setOnInsert: {
                password: '123456'
              }
            },
            { upsert: true, new: true }
          );
        }
      }
    } catch (studentErr) {
      console.warn('Could not upsert into EventStudent:', studentErr.message);
    }

    // Send invoice email asynchronously
    try {
      const eventsController = require('../Events/Events.controller');
      const emailPayload = {
        email: participantsData[0]?.email || '',
        invoiceId: `INV/${new Date().getFullYear()}/${registration._id.toString().substring(18)}`.toUpperCase(),
        invoiceDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
        eventName: eventName || '',
        teamSize: Number(teamSize) || participantsData.length,
        amountPaid: parsedAmount,
        participants: participantsData,
      };

      if (emailPayload.email) {
        eventsController.sendInvoiceMailInternal(emailPayload).catch(e => {
          console.error('Background invoice email failed:', e);
        });
      }
    } catch (mailErr) {
      console.error('Failed to initiate invoice mail after manual registration', mailErr);
    }

    return res.status(200).json({
      ok: true,
      message: 'Registration created and verified successfully',
      teamId,
      registrationId: registration._id,
      registration
    });
  } catch (err) {
    console.error('manualAddRegistration error:', err);
    return res.status(500).json({ error: 'Failed to create manual registration', details: err.message });
  }
};

// ─── Year normalization helper ──────────────────────────────────────────────
const normalizeYear = (year) => {
  if (!year) return null;
  const str = String(year).trim().toUpperCase();
  if (['1', 'I', '1ST', 'FIRST', '1ST YEAR', '1 YEAR', 'I YEAR', 'I-YEAR', 'I-YEARS'].includes(str)) return '1';
  if (['2', 'II', '2ND', 'SECOND', '2ND YEAR', '2 YEAR', 'II YEAR', 'II-YEAR', 'II-YEARS'].includes(str)) return '2';
  if (['3', 'III', '3RD', 'THIRD', '3RD YEAR', '3 YEAR', 'III YEAR', 'III-YEAR', 'III-YEARS'].includes(str)) return '3';
  if (['4', 'IV', '4TH', 'FOURTH', '4TH YEAR', '4 YEAR', 'IV YEAR', 'IV-YEAR', 'IV-YEARS'].includes(str)) return '4';

  if (str.startsWith('1') || str.includes('1ST') || str.includes('FIRST')) return '1';
  if (str.startsWith('2') || str.includes('2ND') || str.includes('SECOND')) return '2';
  if (str.startsWith('3') || str.includes('3RD') || str.includes('THIRD')) return '3';
  if (str.startsWith('4') || str.includes('4TH') || str.includes('FOURTH')) return '4';
  return null;
};

// ─── Campus classification helper ────────────────────────────────────────────
const classifyCampus = (college = '') => {
  const lower = college.toLowerCase();
  if (
    lower.includes('aditya university') ||
    lower.includes('aus') ||
    lower.includes('aditya engineering college')
  ) return 'AUS';
  if (lower.includes('acet') || lower.includes('aditya college')) return 'ACET';
  return 'Others';
};

// ─── Dashboard Statistics ─────────────────────────────────────────────────────
exports.getDashboardStats = async (req, res) => {
  try {
    const andConditions = [
      {
        $or: [
          { paymentStatus: 'PAID' },
          { paymentStatus: 'paid' },
          { verified: true }
        ]
      }
    ];

    const roleFilter = await getRoleFilterQuery(req);
    if (roleFilter && Object.keys(roleFilter).length > 0) {
      andConditions.push(roleFilter);
    }

    const finalQuery = andConditions.length > 0 ? { $and: andConditions } : {};
    const allPayments = await PaymentRegistration.find(finalQuery).lean();

    // Flatten all participants with their parent payment context
    const participants = [];
    allPayments.forEach((p) => {
      (p.participants || []).forEach((part) => {
        participants.push({
          ...part,
          eventName: p.eventName || '',
          category: p.category || '',
          schoolId: p.schoolId || '',
          teamId: p._id,
        });
      });
    });

    const totalTeams = allPayments.length;
    const totalStudents = participants.length;

    // ─── Year-wise counts ─────────────────────────────────
    const yearCounts = { '1': 0, '2': 0, '3': 0, '4': 0, other: 0 };
    participants.forEach((p) => {
      const normalized = normalizeYear(p.year);
      if (normalized && yearCounts[normalized] !== undefined) {
        yearCounts[normalized]++;
      } else {
        yearCounts.other++;
      }
    });

    // ─── Campus-wise counts ───────────────────────────────
    const campusMap = {};
    const romanMap = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV' };
    participants.forEach((p) => {
      const campus = classifyCampus(p.college || p.otherCollege || '');
      if (!campusMap[campus]) campusMap[campus] = { I: 0, II: 0, III: 0, IV: 0, total: 0 };
      const normalized = normalizeYear(p.year);
      const key = normalized ? romanMap[normalized] : 'I';
      campusMap[campus][key]++;
      campusMap[campus].total++;
    });

    const EventSchools = require('../EventSchools/EventSchools.model');
    const Events = require('../Events/Events.model');
    const EventDepartment = require('../EventDepartment/EventDepartment.model');

    const participantDeptAggPromise = PaymentRegistration.aggregate([
      {
        $match: roleFilter && Object.keys(roleFilter).length > 0
          ? { $and: [{ paymentStatus: 'PAID' }, roleFilter] }
          : { paymentStatus: 'PAID' }
      },
      {
        $unwind: '$participants'
      },
      {
        $group: {
          _id: '$participants.department',
          participantCount: {
            $sum: 1
          }
        }
      },
      {
        $sort: {
          participantCount: -1
        }
      }
    ]);

    const [allSchools, allEvents, allEventDepts, participantDeptAgg] = await Promise.all([
      EventSchools.find({}).lean(),
      Events.find({}).populate('eventSchool').populate('department').lean(),
      EventDepartment.find({}).sort({ name: 1 }).lean(),
      participantDeptAggPromise,
    ]);

    const schoolById = new Map();
    const schoolByShortName = new Map();
    const schoolByName = new Map();

    allSchools.forEach((g) => {
      schoolById.set(g._id.toString(), g);
      if (g.shortName) schoolByShortName.set(g.shortName.toLowerCase().trim(), g);
      if (g.name) schoolByName.set(g.name.toLowerCase().trim(), g);
    });

    const eventSchoolMap = new Map();
    allEvents.forEach((e) => {
      if (e._id) eventSchoolMap.set(e._id.toString(), e.eventSchool);
      if (e.eventName) eventSchoolMap.set(e.eventName.toLowerCase().trim(), e.eventSchool);
    });

    const resolveSchoolForPayment = (p) => {
      // 1. Match by eventId
      if (p.eventId) {
        const eId = p.eventId.toString().toLowerCase().trim();
        if (eventSchoolMap.has(eId)) return eventSchoolMap.get(eId);
        if (schoolById.has(eId)) return schoolById.get(eId);
      }

      // 2. Match by exact or partial eventName
      if (p.eventName) {
        const eName = p.eventName.toLowerCase().trim();
        if (eventSchoolMap.has(eName)) return eventSchoolMap.get(eName);
        for (const e of allEvents) {
          if (e.eventName) {
            const target = e.eventName.toLowerCase().trim();
            if (target.includes(eName) || eName.includes(target)) {
              if (e.eventSchool) return e.eventSchool;
            }
          }
        }
      }

      // 3. Match by schoolId / event group alias
      if (p.schoolId) {
        const sId = p.schoolId.toLowerCase().trim();
        if (schoolById.has(sId)) return schoolById.get(sId);
        if (schoolByShortName.has(sId)) return schoolByShortName.get(sId);
        if (schoolByName.has(sId)) return schoolByName.get(sId);

        if (sId.includes('digi') || sId.includes('comp') || sId.includes('soc')) {
          return schoolByShortName.get('soc') || schoolByName.get('school of computing');
        }
        if (sId.includes('krishi') || sId.includes('agri') || sId.includes('science') || sId.includes('sos')) {
          return schoolByShortName.get('sos') || schoolByName.get('school of science');
        }
        if (sId.includes('kriya') || sId.includes('eng') || sId.includes('soe') || sId.includes('tech')) {
          return schoolByShortName.get('soe') || schoolByName.get('school of engineering');
        }
        if (sId.includes('bus') || sId.includes('sob') || sId.includes('mgmt')) {
          return schoolByShortName.get('sob') || schoolByName.get('school of business');
        }
      }

      // 4. Match by category / department
      if (p.category) {
        const cat = p.category.toLowerCase().trim();
        if (cat.includes('cse') || cat.includes('it') || cat.includes('ds') || cat.includes('iot') || cat.includes('aiml') || cat.includes('mca')) {
          return schoolByShortName.get('soc') || schoolByName.get('school of computing');
        }
        if (cat.includes('agri') || cat.includes('science') || cat.includes('forensic')) {
          return schoolByShortName.get('sos') || schoolByName.get('school of science');
        }
        if (cat.includes('mech') || cat.includes('civil') || cat.includes('eee') || cat.includes('ece') || cat.includes('petro') || cat.includes('mining')) {
          return schoolByShortName.get('soe') || schoolByName.get('school of engineering');
        }
        if (cat.includes('bus') || cat.includes('mgmt') || cat.includes('comm')) {
          return schoolByShortName.get('sob') || schoolByName.get('school of business');
        }
      }

      return allSchools[0] || null;
    };


    // ─── Group / School-wise stats (strictly for existing DB groups) ────────
    const schoolMap = {};
    allSchools.forEach((g) => {
      const gKey = g.shortName || g.name;
      schoolMap[gKey] = {
        group: gKey,
        name: g.name,
        shortName: g.shortName || g.name,
        eventNames: new Set(),
        teamCount: 0,
        studentCount: 0,
        aus: 0,
        acet: 0,
        other: 0,
        participatedStudents: 0,
        revenue: 0,
      };
    });

    // ─── Department-wise stats (from EventDepartment collection) ────────
    const deptMap = {};
    allEventDepts.forEach((d) => {
      const dKey = d.name;
      deptMap[dKey] = {
        id: d._id ? d._id.toString() : '',
        dept: dKey,
        name: dKey,
        eventNames: new Set(),
        teamCount: 0,
        studentCount: 0,
        aus: 0,
        acet: 0,
        other: 0,
        participatedStudents: 0,
        revenue: 0,
      };
    });

    // Populate events count for each department from Event model
    allEvents.forEach((e) => {
      (e.department || []).forEach((d) => {
        const dName = d.name || (allEventDepts.find(ad => ad._id.toString() === (d._id || d).toString())?.name);
        if (dName && deptMap[dName]) {
          deptMap[dName].eventNames.add(e.eventName);
        }
      });
    });

    allPayments.forEach((p) => {
      // 1. Group Resolution
      const group = resolveSchoolForPayment(p);
      const gKey = group ? (group.shortName || group.name) : (allSchools[0]?.shortName || allSchools[0]?.name);

      if (gKey && schoolMap[gKey]) {
        schoolMap[gKey].eventNames.add(p.eventName || '');
        schoolMap[gKey].teamCount++;
        schoolMap[gKey].studentCount += (p.participants || []).length;
        schoolMap[gKey].revenue += Number(p.amountRupees || p.amount || 0);
      }

      // 2. Department Resolution
      const targetDeptNames = new Set();
      const cat = (p.category || '').toUpperCase().trim();
      const sId = (p.schoolId || '').toUpperCase().trim();

      allEventDepts.forEach((d) => {
        const dName = d.name.toUpperCase().trim();
        if (cat === dName || sId === dName) {
          targetDeptNames.add(d.name);
        } else if (cat.includes(dName)) {
          const regex = new RegExp(`\\b${dName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i');
          if (regex.test(cat)) {
            targetDeptNames.add(d.name);
          }
        }
      });

      if (targetDeptNames.size === 0) {
        const pName = (p.eventName || '').toLowerCase().trim();
        const pEventId = (p.eventId || '').toLowerCase().trim();

        const matchedEvent = allEvents.find((e) =>
          (e._id && e._id.toString().toLowerCase() === pEventId) ||
          (e.eventName && e.eventName.toLowerCase().trim() === pName)
        );

        if (matchedEvent && Array.isArray(matchedEvent.department)) {
          matchedEvent.department.forEach((d) => {
            const dName = d.name || (allEventDepts.find(ad => ad._id.toString() === (d._id || d).toString())?.name);
            if (dName && deptMap[dName]) {
              targetDeptNames.add(dName);
            }
          });
        }
      }

      if (targetDeptNames.size === 0) {
        if (cat.includes('BUSINESS') || sId.includes('BUSINESS')) {
          if (deptMap['BUSINESS SCHOOL']) targetDeptNames.add('BUSINESS SCHOOL');
        } else if (cat.includes('AGRICULTURE') || sId.includes('AGRICULTURE')) {
          if (deptMap['AGRICULTURE']) targetDeptNames.add('AGRICULTURE');
        } else if (cat.includes('CSE') || sId.includes('CSE')) {
          if (deptMap['CSE']) targetDeptNames.add('CSE');
        }
      }

      const amount = Number(p.amountRupees || p.amount || 0);
      const studentCount = (p.participants || []).length;

      targetDeptNames.forEach((dName) => {
        if (deptMap[dName]) {
          deptMap[dName].eventNames.add(p.eventName || '');
          deptMap[dName].teamCount++;
          deptMap[dName].studentCount += studentCount;
          deptMap[dName].revenue += amount;

          (p.participants || []).forEach((part) => {
            const campus = classifyCampus(part.college || part.otherCollege || '');
            if (campus === 'AUS') deptMap[dName].aus++;
            else if (campus === 'ACET') deptMap[dName].acet++;
            else deptMap[dName].other++;
            deptMap[dName].participatedStudents++;
          });
        }
      });

      (p.participants || []).forEach((part) => {
        const campus = classifyCampus(part.college || part.otherCollege || '');
        if (campus === 'AUS') {
          if (gKey && schoolMap[gKey]) schoolMap[gKey].aus++;
        } else if (campus === 'ACET') {
          if (gKey && schoolMap[gKey]) schoolMap[gKey].acet++;
        } else {
          if (gKey && schoolMap[gKey]) schoolMap[gKey].other++;
        }
        if (gKey && schoolMap[gKey]) schoolMap[gKey].participatedStudents++;
      });
    });

    const departmentStats = Object.values(deptMap).map((d) => ({
      id: d.id,
      dept: d.name,
      name: d.name,
      eventCount: d.eventNames.size,
      teamCount: d.teamCount,
      studentCount: d.studentCount,
      aus: d.aus,
      acet: d.acet,
      other: d.other,
      participatedStudents: d.participatedStudents,
      revenue: Math.round(d.revenue * 100) / 100,
    }));


    const schoolStats = Object.values(schoolMap).map((g) => ({
      group: g.group,
      dept: g.shortName || g.name,
      name: g.name,
      shortName: g.shortName,
      eventCount: g.eventNames.size,
      teamCount: g.teamCount,
      studentCount: g.studentCount,
      aus: g.aus,
      acet: g.acet,
      other: g.other,
      participatedStudents: g.participatedStudents,
      revenue: Math.round(g.revenue * 100) / 100,
    }));

    // ─── Gender & Attendance stats ─────────────────────────
    const genderMap = { male: 0, female: 0, others: 0 };
    let totalAttended = 0;
    let accommodationCheckedInCount = 0;

    participants.forEach((p) => {
      const g = (p.gender || '').toLowerCase();
      if (g === 'male') genderMap.male++;
      else if (g === 'female') genderMap.female++;
      else genderMap.others++;

      if (p.attended) totalAttended++;
      if (p.accommodationCheckedIn) accommodationCheckedInCount++;
    });

    // ─── Campus-wise gender ───────────────────────────────
    const campusGenderMap = {};
    participants.forEach((p) => {
      const campus = classifyCampus(p.college || p.otherCollege || '');
      if (!campusGenderMap[campus]) campusGenderMap[campus] = { male: 0, female: 0, others: 0 };
      const g = (p.gender || '').toLowerCase();
      if (g === 'male') campusGenderMap[campus].male++;
      else if (g === 'female') campusGenderMap[campus].female++;
      else campusGenderMap[campus].others++;
    });

    // ─── Accommodation stats ──────────────────────────────
    let accommodationYes = 0;
    let accommodationNo = 0;
    const accommGender = { male: 0, female: 0, others: 0 };
    participants.forEach((p) => {
      if ((p.accommodation || '').toLowerCase() === 'yes') {
        accommodationYes++;
        const g = (p.gender || '').toLowerCase();
        if (g === 'male') accommGender.male++;
        else if (g === 'female') accommGender.female++;
        else accommGender.others++;
      } else {
        accommodationNo++;
      }
    });

    // ─── Revenue stats ────────────────────────────────────
    let totalRevenue = 0;
    const eventRevenueMap = {};
    const dailyRevenueMap = {};

    allPayments.forEach((p) => {
      const amount = Number(p.amountRupees || p.amount || 0);
      totalRevenue += amount;

      // Per-event revenue
      const evtKey = p.eventName || 'Unknown';
      if (!eventRevenueMap[evtKey]) eventRevenueMap[evtKey] = { teams: 0, revenue: 0 };
      eventRevenueMap[evtKey].revenue += amount;
      eventRevenueMap[evtKey].teams++;

      // Daily revenue trend
      const dateKey = p.paidAt
        ? new Date(p.paidAt).toISOString().slice(0, 10)
        : p.createdAt
          ? new Date(p.createdAt).toISOString().slice(0, 10)
          : null;
      if (dateKey) {
        if (!dailyRevenueMap[dateKey]) dailyRevenueMap[dateKey] = 0;
        dailyRevenueMap[dateKey] += amount;
      }
    });

    const revenueByEvent = Object.entries(eventRevenueMap)
      .map(([event, data]) => ({
        event,
        revenue: Math.round(data.revenue * 100) / 100,
        teams: data.teams,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const revenueByDate = Object.entries(dailyRevenueMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, revenue]) => ({
        date,
        revenue: Math.round(revenue * 100) / 100,
      }));

    const participantDeptStats = (participantDeptAgg || [])
      .filter((d) => d._id)
      .map((d) => ({
        dept: d._id,
        name: d._id,
        participantCount: d.participantCount,
      }));

    return res.json({
      totalTeams,
      totalStudents,
      totalAttended,
      yearCounts,
      yearWise: yearCounts,
      campusWise: campusMap,
      departmentStats,
      schoolStats,
      participantDeptStats,
      genderStats: genderMap,
      campusGenderStats: campusGenderMap,
      accommodation: {
        yes: accommodationYes,
        no: accommodationNo,
        checkedIn: accommodationCheckedInCount,
        genderBreakdown: accommGender,
      },
      revenue: {
        total: Math.round(totalRevenue * 100) / 100,
        byEvent: revenueByEvent,
        byDate: revenueByDate,
      },
    });
  } catch (err) {
    console.error('Payments.getDashboardStats error', err);
    return res.status(500).json({ error: 'Unable to fetch dashboard stats', details: err.message });
  }
};

exports.scanBarcode = async (req, res) => {
  try {
    const { barcode } = req.body;
    if (!barcode) return res.status(400).json({ error: 'Barcode is required' });

    // Find the registration containing this barcode
    const registration = await PaymentRegistration.findOne({ 'participants.barcode': barcode });

    if (!registration) {
      return res.status(404).json({ error: 'Pass not found or invalid barcode.' });
    }

    const regPaymentStatus = (registration.paymentStatus || registration.payment || '').toString().trim().toUpperCase();
    if (regPaymentStatus !== 'PAID') {
      return res.status(400).json({
        error: `Pass is invalid. Payment status is ${regPaymentStatus || 'UNPAID'}. Only passes with PAID status are eligible for attendance.`
      });
    }

    // Verify SCHOOL_COORDINATOR and FACULTY_COORDINATOR access
    const activeRole = req.headers['active-role'];
    if (activeRole === 'SCHOOL_COORDINATOR' || activeRole === 'FACULTY_COORDINATOR') {
      const jwt = require('jsonwebtoken');
      const token = (req.headers.authorization && req.headers.authorization.split(' ')[1]) || req.cookies?.token;
      let authorized = false;
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          const empId = decoded.institutionId || decoded.employeeId || decoded.employeeCode || decoded.id || decoded.userId;
          if (empId) {
            const empIdStr = String(empId).trim();
            const empIdNum = Number(empIdStr);
            const empMatch = isNaN(empIdNum) ? [empIdStr] : [empIdStr, empIdNum];

            const EventSchools = require('../EventSchools/EventSchools.model');
            const Events = require('../Events/Events.model');

            const mySchools = await EventSchools.find({
              $or: [
                { 'coordinators.employeeId': { $in: empMatch } },
                { 'coordinator.employeeId': { $in: empMatch } }
              ]
            }).select('name shortName _id');
            const mySchoolNames = mySchools.flatMap(g => [
              (g.name || '').toLowerCase(),
              (g.shortName || '').toLowerCase(),
              g._id.toString()
            ]).filter(Boolean);

            const myEvents = await Events.find({
              $or: [
                ...(activeRole === 'SCHOOL_COORDINATOR' ? [{ eventSchool: { $in: mySchools.map(s => s._id) } }] : []),
                { 'conveners.employeeId': { $in: empMatch } },
                { 'facultyCoordinators.employeeId': { $in: empMatch } },
                { 'facultyCoordinator.employeeId': { $in: empMatch } }
              ]
            }).select('eventName _id');
            const myEventNames = myEvents.map(e => (e.eventName || '').toLowerCase());
            const myEventIds = myEvents.map(e => e._id.toString());

            const regSchoolId = (registration.schoolId || '').toLowerCase();
            const regEventName = (registration.eventName || '').toLowerCase();
            const regCategory = (registration.category || '').toLowerCase();
            const regEventId = (registration.eventId || '').toString();

            if (
              mySchoolNames.includes(regSchoolId) ||
              mySchoolNames.includes(regCategory) ||
              myEventNames.includes(regEventName) ||
              myEventNames.includes(regCategory) ||
              (regEventId && myEventIds.includes(regEventId))
            ) {
              authorized = true;
            }
          }
        } catch (err) {
          console.error('Error decoding token for scanBarcode', err);
        }
      }

      if (!authorized) {
        return res.status(403).json({ error: 'You are not authorized to scan passes for this event.' });
      }
    }

    // Find the specific participant
    const participantIndex = registration.participants.findIndex(p => p.barcode === barcode);
    if (participantIndex === -1) {
      return res.status(404).json({ error: 'Participant not found in registration.' });
    }

    const participant = registration.participants[participantIndex];

    if (participant.attended) {
      await PaymentRegistration.updateOne(
        { _id: registration._id, 'participants.barcode': barcode },
        { $inc: { 'participants.$.scanCount': 1 } }
      );
      return res.status(400).json({ error: 'Participant has already been marked as attended.', participant: registration.participants[participantIndex], eventName: registration.eventName });
    }

    // Mark as attended and increment scan count
    await PaymentRegistration.updateOne(
      { _id: registration._id, 'participants.barcode': barcode },
      {
        $set: { 'participants.$.attended': true },
        $inc: { 'participants.$.scanCount': 1 }
      }
    );

    return res.json({
      message: 'Participant marked as attended successfully.',
      participant: registration.participants[participantIndex],
      eventName: registration.eventName,
      teamSize: registration.teamSize
    });

  } catch (err) {
    console.error('Payments.scanBarcode error', err);
    return res.status(500).json({ error: 'Unable to scan barcode', details: err.message });
  }
};

exports.scanAccommodationBarcode = async (req, res) => {
  try {
    const { barcode } = req.body;
    if (!barcode) return res.status(400).json({ error: 'Barcode is required' });

    // Verify ACCOMMODATION_COORDINATOR access
    const activeRole = req.headers['active-role'];
    if (activeRole !== 'ACCOMMODATION_COORDINATOR') {
      return res.status(403).json({ error: 'You are not authorized to scan for accommodation.' });
    }

    // Find the registration containing this barcode
    const registration = await PaymentRegistration.findOne({ 'participants.barcode': barcode });

    if (!registration) {
      return res.status(404).json({ error: 'Pass not found or invalid barcode.' });
    }

    // Find the specific participant
    const participantIndex = registration.participants.findIndex(p => p.barcode === barcode);
    if (participantIndex === -1) {
      return res.status(404).json({ error: 'Participant not found in registration.' });
    }

    const participant = registration.participants[participantIndex];

    if (participant.accommodation?.toLowerCase() !== 'yes') {
      return res.status(400).json({ error: 'This participant has not requested accommodation.', participant, eventName: registration.eventName });
    }

    if (participant.accommodationCheckedIn) {
      return res.status(400).json({ error: 'Participant has already been checked into accommodation.', participant, eventName: registration.eventName });
    }

    if (!participant.accommodationPayment || !participant.accommodationPayment.paid) {
      return res.json({
        message: 'Payment required for accommodation.',
        paymentRequired: true,
        participant: registration.participants[participantIndex],
        eventName: registration.eventName
      });
    }

    // Mark as checked in since they have already paid
    registration.participants[participantIndex].accommodationCheckedIn = true;
    registration.markModified('participants');
    await registration.save();

    return res.json({
      message: 'Participant accommodation checked in successfully.',
      participant: registration.participants[participantIndex],
      eventName: registration.eventName
    });

  } catch (err) {
    console.error('Payments.scanAccommodationBarcode error', err);
    return res.status(500).json({ error: 'Unable to scan barcode', details: err.message });
  }
};

exports.createAccommodationOrder = async (req, res) => {
  try {
    const { amount, receipt } = req.body;
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // amount should be in paise. For Rs. 2, it is 200.
    const order = await paymentsService.createOrder({ amount, currency: 'INR', receipt });
    return res.json({ orderId: order.id, order });
  } catch (err) {
    console.error('Payments.createAccommodationOrder error', err);
    return res.status(500).json({ error: 'Unable to create accommodation order', details: err.message });
  }
};

exports.verifyAccommodationPayment = async (req, res) => {
  try {
    const { barcode, order_id, payment_id, signature, amount } = req.body;

    if (!order_id || !payment_id || !signature || !barcode) {
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

    const actualAmountInPaisa = fetchedPayment ? fetchedPayment.amount : (amount || 200);

    const registration = await PaymentRegistration.findOne({ 'participants.barcode': barcode });
    if (!registration) {
      return res.status(404).json({ error: 'Participant registration not found' });
    }

    const participantIndex = registration.participants.findIndex(p => p.barcode === barcode);
    if (participantIndex === -1) {
      return res.status(404).json({ error: 'Participant not found in registration' });
    }

    // Mark as paid and checked in
    registration.participants[participantIndex].accommodationPayment = {
      paid: true,
      amount: actualAmountInPaisa,
      razorpayOrderId: order_id,
      razorpayPaymentId: payment_id,
      paidAt: new Date()
    };
    registration.participants[participantIndex].accommodationCheckedIn = true;

    registration.markModified('participants');
    await registration.save();

    return res.json({
      message: 'Accommodation payment successful and participant checked in.',
      participant: registration.participants[participantIndex],
      eventName: registration.eventName
    });
  } catch (err) {
    console.error('Payments.verifyAccommodationPayment error', err);
    return res.status(500).json({ error: 'Unable to verify accommodation payment', details: err.message });
  }
};

exports.updateAttendance = async (req, res) => {
  try {
    const { receipt, roll, barcode, attended } = req.body;

    if (typeof attended !== 'boolean') {
      return res.status(400).json({ error: 'Attended status must be a boolean.' });
    }

    // Find registration using receipt and matching either roll or barcode
    let query = {};
    if (receipt) query.receipt = receipt;

    // Fallback if receipt is missing, we must have roll or barcode
    if (!receipt && !roll && !barcode) {
      return res.status(400).json({ error: 'Missing identification fields.' });
    }

    // We can also match the exact participant within the array
    let elemMatch = {};
    if (barcode) elemMatch.barcode = barcode;
    else if (roll) elemMatch.roll = roll;

    if (Object.keys(elemMatch).length > 0) {
      query.participants = { $elemMatch: elemMatch };
    }

    const registration = await PaymentRegistration.findOne(query);

    if (!registration) {
      return res.status(404).json({ error: 'Registration or participant not found.' });
    }

    const regPaymentStatus = (registration.paymentStatus || registration.payment || '').toString().trim().toUpperCase();
    if (regPaymentStatus !== 'PAID') {
      return res.status(400).json({
        error: `Cannot update attendance. Payment status is ${regPaymentStatus || 'UNPAID'}. Only passes with PAID status can be updated.`
      });
    }

    const activeRole = req.headers['active-role'];
    if (activeRole === 'SCHOOL_COORDINATOR' || activeRole === 'FACULTY_COORDINATOR') {
      const jwt = require('jsonwebtoken');
      const token = (req.headers.authorization && req.headers.authorization.split(' ')[1]) || req.cookies?.token;
      let authorized = false;
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          const empId = decoded.institutionId || decoded.employeeId || decoded.employeeCode || decoded.id || decoded.userId;
          if (empId) {
            const empIdStr = String(empId).trim();
            const empIdNum = Number(empIdStr);
            const empMatch = isNaN(empIdNum) ? [empIdStr] : [empIdStr, empIdNum];

            const EventSchools = require('../EventSchools/EventSchools.model');
            const Events = require('../Events/Events.model');

            const mySchools = await EventSchools.find({
              $or: [
                { 'coordinators.employeeId': { $in: empMatch } },
                { 'coordinator.employeeId': { $in: empMatch } }
              ]
            }).select('name shortName _id');
            const mySchoolNames = mySchools.flatMap(g => [
              (g.name || '').toLowerCase(),
              (g.shortName || '').toLowerCase(),
              g._id.toString()
            ]).filter(Boolean);

            const myEvents = await Events.find({
              $or: [
                ...(activeRole === 'SCHOOL_COORDINATOR' ? [{ eventSchool: { $in: mySchools.map(s => s._id) } }] : []),
                { 'conveners.employeeId': { $in: empMatch } },
                { 'facultyCoordinators.employeeId': { $in: empMatch } },
                { 'facultyCoordinator.employeeId': { $in: empMatch } }
              ]
            }).select('eventName _id');
            const myEventNames = myEvents.map(e => (e.eventName || '').toLowerCase());
            const myEventIds = myEvents.map(e => e._id.toString());

            const regSchoolId = (registration.schoolId || '').toLowerCase();
            const regEventName = (registration.eventName || '').toLowerCase();
            const regCategory = (registration.category || '').toLowerCase();
            const regEventId = (registration.eventId || '').toString();

            if (
              mySchoolNames.includes(regSchoolId) ||
              mySchoolNames.includes(regCategory) ||
              myEventNames.includes(regEventName) ||
              myEventNames.includes(regCategory) ||
              (regEventId && myEventIds.includes(regEventId))
            ) {
              authorized = true;
            }
          }
        } catch (err) {
          console.error('Error decoding token for updateAttendance', err);
        }
      }

      if (!authorized) {
        return res.status(403).json({ error: 'You are not authorized to update passes for this event.' });
      }
    }

    const participantIndex = registration.participants.findIndex(p => {
      if (barcode && p.barcode === barcode) return true;
      if (roll && p.roll === roll) return true;
      return false;
    });

    if (participantIndex === -1) {
      return res.status(404).json({ error: 'Participant not found in registration.' });
    }

    registration.participants[participantIndex].attended = attended;
    registration.markModified('participants');
    await registration.save();

    return res.json({
      message: 'Participant attendance updated successfully.',
      participant: registration.participants[participantIndex],
    });

  } catch (err) {
    console.error('Payments.updateAttendance error', err);
    return res.status(500).json({ error: 'Unable to update attendance', details: err.message });
  }
};

exports.updateWinnerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { prizeType, status } = req.body;

    if (typeof status !== 'boolean') {
      return res.status(400).json({ error: 'status must be a boolean.' });
    }

    if (!['first', 'second', 'third'].includes(prizeType)) {
      return res.status(400).json({ error: 'Invalid prize type.' });
    }

    const registration = await PaymentRegistration.findById(id);
    if (!registration) {
      return res.status(404).json({ error: 'Registration not found.' });
    }

    const regPaymentStatus = (registration.paymentStatus || registration.payment || '').toString().trim().toUpperCase();
    if (regPaymentStatus !== 'PAID') {
      return res.status(400).json({
        error: `Cannot update winner status. Registration payment status is ${regPaymentStatus || 'UNPAID'}. Only PAID registrations are eligible.`
      });
    }

    if (status === true) {
      // Mutual exclusivity: if setting one to true, others become false
      registration.isFirstWinner = prizeType === 'first';
      registration.isSecondWinner = prizeType === 'second';
      registration.isThirdWinner = prizeType === 'third';
    } else {
      // Just toggle the specific one off
      if (prizeType === 'first') registration.isFirstWinner = false;
      if (prizeType === 'second') registration.isSecondWinner = false;
      if (prizeType === 'third') registration.isThirdWinner = false;
    }

    await registration.save();

    return res.json({
      message: 'Winner status updated successfully.',
      isFirstWinner: registration.isFirstWinner,
      isSecondWinner: registration.isSecondWinner,
      isThirdWinner: registration.isThirdWinner,
    });
  } catch (err) {
    console.error('Payments.updateWinnerStatus error', err);
    return res.status(500).json({ error: 'Unable to update winner status', details: err.message });
  }
};

exports.uploadPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo uploaded' });
    }
    return res.json({ filename: req.file.filename, url: `/uploads/othercollegephotos/${req.file.filename}` });
  } catch (err) {
    console.error('Error uploading photo:', err);
    return res.status(500).json({ error: 'Upload failed' });
  }
};


exports.servePhoto = async (req, res) => {
  try {
    const roll = req.params.roll;
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '../../uploads/othercollegephotos');
    if (!fs.existsSync(dir)) return res.status(404).end();
    const files = fs.readdirSync(dir);
    const photoFile = files.reverse().find(f => f.startsWith('photo-' + roll + '-'));
    if (photoFile) return res.sendFile(path.join(dir, photoFile));
    return res.status(404).end();
  } catch (err) {
    return res.status(500).end();
  }
};
exports.checkPhoto = async (req, res) => {
  try {
    const roll = req.params.roll;
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '../../uploads/othercollegephotos');

    if (!fs.existsSync(dir)) return res.json({ exists: false });

    const files = fs.readdirSync(dir);
    const photoFile = files.reverse().find(f => f.startsWith(`photo-${roll}-`));

    if (photoFile) {
      return res.json({ exists: true, url: `/uploads/othercollegephotos/${photoFile}` });
    }
    return res.json({ exists: false });
  } catch (err) {
    console.error('Error checking photo:', err);
    return res.status(500).json({ error: 'Check failed' });
  }
};

exports.getAccommodationQuotaStats = async (req, res) => {
  try {
    const statsAgg = await PaymentRegistration.aggregate([
      { $match: { paymentStatus: 'PAID' } },
      { $unwind: '$participants' },
      {
        $match: {
          'participants.accommodation': { $regex: /^yes$/i }
        }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $regexMatch: { input: '$participants.gender', regex: /^female|girl/i } },
              'FEMALE',
              'MALE'
            ]
          },
          count: { $sum: 1 }
        }
      }
    ]);

    let male = 0;
    let female = 0;
    statsAgg.forEach(s => {
      if (s._id === 'FEMALE') female = s.count;
      else if (s._id === 'MALE') male = s.count;
    });

    const total = male + female;

    return res.json({
      ok: true,
      male,
      female,
      total,
      limits: {
        male: 100,
        female: 50,
        total: 150
      },
      remaining: {
        male: Math.max(0, 100 - male),
        female: Math.max(0, 50 - female),
        total: Math.max(0, 150 - total)
      }
    });
  } catch (err) {
    console.error('getAccommodationQuotaStats error:', err);
    return res.status(500).json({ error: 'Failed to fetch accommodation stats', details: err.message });
  }
};

exports.updateParticipantAccommodation = async (req, res) => {
  try {
    const {
      registrationId,
      teamId,
      roll,
      rollnumber,
      participantBarcode,
      days,
      dayscount,
      daysCount,
      amount,
      payment,
      accommodation = 'Yes',
      email,
      name,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      rawPaymentData,
      paymentMethod = 'ONLINE'
    } = req.body;

    const targetRoll = String(roll || rollnumber || '').trim();
    const targetEmail = String(email || '').trim().toLowerCase();
    let registration = null;

    // First try finding by teamId and participant roll / rollnumber / email
    if (teamId && (targetRoll || targetEmail)) {
      const cleanTeam = String(teamId).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const orList = [];
      if (targetRoll) {
        orList.push(
          { 'participants.roll': targetRoll },
          { 'participants.rollnumber': targetRoll },
          { 'participants.roll': new RegExp(`^${targetRoll}$`, 'i') },
          { 'participants.rollnumber': new RegExp(`^${targetRoll}$`, 'i') }
        );
      }
      if (targetEmail) {
        orList.push(
          { 'participants.email': targetEmail },
          { 'participants.email': new RegExp(`^${targetEmail}$`, 'i') }
        );
      }

      registration = await PaymentRegistration.findOne({
        teamId: { $regex: new RegExp(`^${cleanTeam}$`, 'i') },
        $or: orList
      });
    }

    // Fallbacks
    if (!registration && registrationId) {
      registration = await PaymentRegistration.findById(registrationId);
    }
    if (!registration && targetRoll) {
      registration = await PaymentRegistration.findOne({
        $or: [
          { 'participants.roll': targetRoll },
          { 'participants.rollnumber': targetRoll },
          { 'participants.roll': new RegExp(`^${targetRoll}$`, 'i') },
          { 'participants.rollnumber': new RegExp(`^${targetRoll}$`, 'i') }
        ]
      });
    }
    if (!registration && targetEmail) {
      registration = await PaymentRegistration.findOne({
        'participants.email': new RegExp(`^${targetEmail}$`, 'i')
      });
    }
    if (!registration && participantBarcode) {
      registration = await PaymentRegistration.findOne({
        'participants.barcode': participantBarcode
      });
    }

    if (!registration) {
      return res.status(404).json({ error: 'Registration not found for the provided teamId and roll number' });
    }

    if (registration.paymentStatus !== 'PAID') {
      return res.status(400).json({ error: 'Accommodation can only be applied to PAID registrations.' });
    }

    let participantIndex = -1;

    // 1. If explicit participantIndex provided, verify it against participant data
    if (
      typeof req.body.participantIndex === 'number' &&
      req.body.participantIndex >= 0 &&
      req.body.participantIndex < registration.participants.length
    ) {
      const cand = registration.participants[req.body.participantIndex];
      const cRoll = String(cand.roll || cand.rollnumber || '').trim().toUpperCase();
      const cBarcode = cand.barcode;
      const cEmail = String(cand.email || '').trim().toLowerCase();

      if (
        (targetRoll && cRoll === targetRoll.toUpperCase()) ||
        (participantBarcode && cBarcode === participantBarcode) ||
        (targetEmail && cEmail === targetEmail) ||
        (!targetRoll && !participantBarcode && !targetEmail)
      ) {
        participantIndex = req.body.participantIndex;
      }
    }

    // 2. Otherwise find by matching roll, barcode, or email
    if (participantIndex === -1) {
      participantIndex = registration.participants.findIndex(p => {
        const pRoll = String(p.roll || p.rollnumber || '').trim().toUpperCase();
        const matchRoll = targetRoll && pRoll === targetRoll.toUpperCase();
        const matchBarcode = participantBarcode && p.barcode === participantBarcode;
        const matchEmail = targetEmail && String(p.email || '').trim().toLowerCase() === targetEmail;
        return matchRoll || matchBarcode || matchEmail;
      });
    }

    if (participantIndex === -1) {
      return res.status(404).json({ error: 'Participant not found in this registration' });
    }

    const participant = registration.participants[participantIndex];
    const isCollegeOther = participant.college === 'Other College' ||
      (participant.college && !['aditya university', 'acet', 'acoe'].includes((participant.college || '').toLowerCase().trim()));

    if (!isCollegeOther) {
      return res.status(400).json({ error: 'Accommodation is only permitted for Other College students.' });
    }

    const isApplying = String(accommodation).toLowerCase() === 'yes';
    const newStatus = isApplying ? 'Yes' : 'No';

    // If changing to Yes, enforce limits!
    if (isApplying && (participant.accommodation || '').toLowerCase() !== 'yes') {
      const isFemale = /^female|girl/i.test(participant.gender || '');
      const genderKey = isFemale ? 'FEMALE' : 'MALE';

      const statsAgg = await PaymentRegistration.aggregate([
        { $match: { paymentStatus: 'PAID' } },
        { $unwind: '$participants' },
        {
          $match: {
            'participants.accommodation': { $regex: /^yes$/i }
          }
        },
        {
          $group: {
            _id: {
              $cond: [
                { $regexMatch: { input: '$participants.gender', regex: /^female|girl/i } },
                'FEMALE',
                'MALE'
              ]
            },
            count: { $sum: 1 }
          }
        }
      ]);

      let currentMale = 0;
      let currentFemale = 0;
      statsAgg.forEach(s => {
        if (s._id === 'FEMALE') currentFemale = s.count;
        else if (s._id === 'MALE') currentMale = s.count;
      });

      const currentTotal = currentMale + currentFemale;

      if (currentTotal >= 150) {
        return res.status(400).json({ error: 'Overall accommodation limit of 150 has been reached.' });
      }

      if (genderKey === 'FEMALE' && currentFemale >= 50) {
        return res.status(400).json({ error: 'Girl accommodation limit of 50 has been reached.' });
      }

      if (genderKey === 'MALE' && currentMale >= 100) {
        return res.status(400).json({ error: 'Male accommodation limit of 100 has been reached.' });
      }
    }

    const numDays = Number(days || dayscount || daysCount) || 1;
    const calculatedAmount = Number(amount) || (numDays * 100);

    const paymentInfo = payment || rawPaymentData || {
      amount: calculatedAmount,
      days: numDays,
      dayscount: numDays,
      paymentMethod,
      paidAt: new Date(),
      razorpayOrderId: razorpayOrderId || '',
      razorpayPaymentId: razorpayPaymentId || `PAY_${Date.now()}`,
      teamId: registration.teamId,
      rollnumber: participant.roll || participant.rollnumber || targetRoll
    };

    participant.accommodation = newStatus;

    if (isApplying) {
      participant.days = numDays;
      participant.dayscount = numDays;
      participant.daysCount = numDays;
      participant.payment = paymentInfo;

      participant.accommodationPayment = {
        paid: true,
        amount: calculatedAmount,
        days: numDays,
        dayscount: numDays,
        daysCount: numDays,
        payment: paymentInfo,
        razorpayOrderId: razorpayOrderId || (paymentInfo && paymentInfo.razorpay_order_id) || '',
        razorpayPaymentId: razorpayPaymentId || (paymentInfo && paymentInfo.razorpay_payment_id) || `MANUAL_${Date.now()}`,
        razorpaySignature: razorpaySignature || (paymentInfo && paymentInfo.razorpay_signature) || '',
        paidAt: new Date(),
        rawPaymentData: paymentInfo
      };
    } else {
      delete participant.days;
      delete participant.dayscount;
      delete participant.daysCount;
      delete participant.payment;
      participant.accommodationPayment = { paid: false };
    }

    registration.markModified('participants');
    await registration.save();

    // Direct atomic MongoDB update so ONLY this exact participant index is affected, never other teammates
    const setFields = {};
    const unsetFields = {};

    if (isApplying) {
      setFields[`participants.${participantIndex}.accommodation`] = 'Yes';
      setFields[`participants.${participantIndex}.days`] = numDays;
      setFields[`participants.${participantIndex}.dayscount`] = numDays;
      setFields[`participants.${participantIndex}.daysCount`] = numDays;
      setFields[`participants.${participantIndex}.payment`] = paymentInfo;
      setFields[`participants.${participantIndex}.accommodationPayment`] = participant.accommodationPayment;
    } else {
      setFields[`participants.${participantIndex}.accommodation`] = 'No';
      setFields[`participants.${participantIndex}.accommodationPayment`] = { paid: false };
      unsetFields[`participants.${participantIndex}.days`] = 1;
      unsetFields[`participants.${participantIndex}.dayscount`] = 1;
      unsetFields[`participants.${participantIndex}.daysCount`] = 1;
      unsetFields[`participants.${participantIndex}.payment`] = 1;
    }

    const updateOps = { $set: setFields };
    if (Object.keys(unsetFields).length > 0) {
      updateOps.$unset = unsetFields;
    }

    await PaymentRegistration.updateOne(
      { _id: registration._id },
      updateOps
    );

    return res.json({
      ok: true,
      message: `Accommodation status updated to "${newStatus}" for ${participant.name || 'participant'}`,
      participant: registration.participants[participantIndex]
    });
  } catch (err) {
    console.error('updateParticipantAccommodation error:', err);
    return res.status(500).json({ error: 'Failed to update accommodation', details: err.message });
  }
};

// @desc    Bulk update PaymentRegistration documents by teamId from Excel/CSV upload
// @route   POST /api/razorpay/registrations/bulk-update-excel
// @access  Private (Event Admin)
exports.bulkUpdateByExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload an Excel or CSV file.' });
    }

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    
    if (req.file.buffer) {
      await workbook.xlsx.load(req.file.buffer);
    } else {
      await workbook.xlsx.readFile(req.file.path);
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).json({ error: 'Excel worksheet is empty or invalid.' });
    }

    // Identify headers from row 1
    const headerRow = worksheet.getRow(1);
    let teamIdColIndex = -1;
    let orderIdColIndex = -1;
    let paymentIdColIndex = -1;
    let statusColIndex = -1;

    headerRow.eachCell((cell, colNumber) => {
      const val = String(cell.value || '').toLowerCase().trim().replace(/[\s_]/g, '');
      if (val === 'teamid' || val === 'team') teamIdColIndex = colNumber;
      else if (val === 'razorpayorderid' || val === 'orderid') orderIdColIndex = colNumber;
      else if (val === 'razorpaypaymentid' || val === 'paymentid') paymentIdColIndex = colNumber;
      else if (val === 'paymentstatus' || val === 'status') statusColIndex = colNumber;
    });

    if (teamIdColIndex === -1) {
      return res.status(400).json({ error: 'Excel file must contain a "teamId" column in the first row.' });
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    const getCellValue = (val) => {
      if (!val) return '';
      if (typeof val === 'object') {
        if (val.text) return String(val.text).trim();
        if (val.result) return String(val.result).trim();
      }
      return String(val).trim();
    };

    // Iterate through data rows starting from row 2
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      
      const teamIdRaw = row.getCell(teamIdColIndex).value;
      const orderIdRaw = orderIdColIndex !== -1 ? row.getCell(orderIdColIndex).value : null;
      const paymentIdRaw = paymentIdColIndex !== -1 ? row.getCell(paymentIdColIndex).value : null;
      const statusRaw = statusColIndex !== -1 ? row.getCell(statusColIndex).value : null;

      const teamId = getCellValue(teamIdRaw);
      const razorpayOrderId = getCellValue(orderIdRaw);
      const razorpayPaymentId = getCellValue(paymentIdRaw);
      const rawStatus = getCellValue(statusRaw).toUpperCase();
      const paymentStatus = rawStatus || 'PAID';

      // Skip completely empty rows
      if (!teamId && !razorpayOrderId && !razorpayPaymentId) {
        continue;
      }

      if (!teamId) {
        errorCount++;
        results.push({
          row: rowNumber,
          teamId: '-',
          razorpayOrderId: razorpayOrderId || '-',
          razorpayPaymentId: razorpayPaymentId || '-',
          paymentStatus: '-',
          status: 'ERROR',
          message: `Row ${rowNumber}: teamId cell is empty.`
        });
        continue;
      }

      // Find registration by teamId
      const registration = await PaymentRegistration.findOne({ teamId: teamId });
      if (!registration) {
        errorCount++;
        results.push({
          row: rowNumber,
          teamId: teamId,
          razorpayOrderId: razorpayOrderId || '-',
          razorpayPaymentId: razorpayPaymentId || '-',
          paymentStatus: paymentStatus,
          status: 'ERROR',
          message: `Row ${rowNumber}: Team ID "${teamId}" not found in database.`
        });
        continue;
      }

      // Update fields
      if (razorpayPaymentId) {
        registration.razorpayPaymentId = razorpayPaymentId;
      }
      if (razorpayOrderId) {
        registration.razorpayOrderId = razorpayOrderId;
      }
      registration.paymentStatus = ['PAID', 'PENDING', 'FAILED'].includes(paymentStatus) ? paymentStatus : 'PAID';
      registration.verified = true;
      if (!registration.paidAt) {
        registration.paidAt = new Date();
      }

      await registration.save();
      successCount++;

      results.push({
        row: rowNumber,
        teamId: teamId,
        razorpayOrderId: registration.razorpayOrderId || '-',
        razorpayPaymentId: registration.razorpayPaymentId || '-',
        paymentStatus: registration.paymentStatus,
        status: 'SUCCESS',
        message: `Row ${rowNumber}: Updated successfully for Team ${teamId}.`
      });
    }

    return res.json({
      ok: true,
      message: `Bulk payment update finished. Processed ${results.length} rows.`,
      summary: {
        totalRows: results.length,
        successCount: successCount,
        errorCount: errorCount
      },
      results: results
    });

  } catch (err) {
    console.error('bulkUpdateByExcel error:', err);
    return res.status(500).json({ error: 'Failed to process bulk Excel payment update', details: err.message });
  }
};


