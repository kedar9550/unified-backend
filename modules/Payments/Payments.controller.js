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
    let query = {};

    const activeRole = req.headers['active-role'];
    if (activeRole === 'EVENT_COORDINATOR') {
      const jwt = require('jsonwebtoken');
      const token = (req.headers.authorization && req.headers.authorization.split(' ')[1]) || req.cookies?.token;
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          const empId = decoded.institutionId;
          if (empId) {
            const Group = require('../Group/Group.model');
            const Events = require('../Events/Events.model');
            
            const myGroups = await Group.find({ 'eventCoordinator.employeeId': empId }).select('name');
            const myGroupNames = myGroups.map(g => new RegExp(`^${g.name}$`, 'i'));

            const myEvents = await Events.find({
                $or: [
                    { 'conveners.employeeId': empId },
                    { 'facultyCoordinators.employeeId': empId },
                    { 'facultyCoordinator.employeeId': empId }
                ]
            }).select('eventName');
            const myEventNames = myEvents.map(e => new RegExp(`^${e.eventName}$`, 'i'));

            query.$or = [
                { schoolId: { $in: myGroupNames } },
                { eventName: { $in: myEventNames } }
            ];
        }
        } catch (err) {
          console.error('Error decoding token for EVENT_COORDINATOR filter', err);
        }
      }
    }

    if (email && email.trim()) {
      const cleanEmail = email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (roll && roll.trim()) {
        const cleanRoll = roll.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.$and = [
          ...(query.$and || []),
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
      const fallbackQuery = { ...query };
      delete fallbackQuery.$and;
      fallbackQuery['participants.email'] = { $regex: new RegExp(`^${cleanEmail}$`, 'i') };
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
      participants: (Array.isArray(participants) ? participants : []).map(p => ({
        ...p,
        barcode: require('crypto').randomBytes(4).toString('hex').toUpperCase()
      })),
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
    let query = {};
    const activeRole = req.headers['active-role'];
    
    if (activeRole === 'EVENT_COORDINATOR') {
      const jwt = require('jsonwebtoken');
      const token = (req.headers.authorization && req.headers.authorization.split(' ')[1]) || req.cookies?.token;
      
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          const empId = decoded.institutionId;
          
          if (empId) {
            const Group = require('../Group/Group.model');
            const Events = require('../Events/Events.model');
            
            const myGroups = await Group.find({ 'eventCoordinator.employeeId': empId }).select('name');
            const myGroupNames = myGroups.map(g => new RegExp(`^${g.name}$`, 'i'));

            const myEvents = await Events.find({
                $or: [
                    { 'conveners.employeeId': empId },
                    { 'facultyCoordinators.employeeId': empId },
                    { 'facultyCoordinator.employeeId': empId }
                ]
            }).select('eventName');
            const myEventNames = myEvents.map(e => new RegExp(`^${e.eventName}$`, 'i'));

            query.$or = [
                { schoolId: { $in: myGroupNames } },
                { eventName: { $in: myEventNames } }
            ];
          }
        } catch (err) {
          console.error('Error decoding token for EVENT_COORDINATOR filter in stats', err);
        }
      }
    }

    const allPayments = await PaymentRegistration.find(query).lean();

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
      const y = String(p.year || '').trim();
      if (yearCounts[y] !== undefined) yearCounts[y]++;
      else yearCounts.other++;
    });

    // ─── Campus-wise counts ───────────────────────────────
    const campusMap = {};
    participants.forEach((p) => {
      const campus = classifyCampus(p.college || p.otherCollege || '');
      if (!campusMap[campus]) campusMap[campus] = { I: 0, II: 0, III: 0, IV: 0, total: 0 };
      const y = String(p.year || '').trim();
      const key = y === '1' ? 'I' : y === '2' ? 'II' : y === '3' ? 'III' : y === '4' ? 'IV' : 'I';
      campusMap[campus][key]++;
      campusMap[campus].total++;
    });

    // ─── Department-wise stats (including revenue) ────────
    const deptMap = {};
    allPayments.forEach((p) => {
      const dept = (p.schoolId || 'Unknown').toUpperCase();
      if (!deptMap[dept]) {
        deptMap[dept] = {
          dept,
          eventNames: new Set(),
          teamCount: 0,
          studentCount: 0,
          aus: 0,
          acet: 0,
          other: 0,
          participatedStudents: 0,
          revenue: 0,
        };
      }
      deptMap[dept].eventNames.add(p.eventName || '');
      deptMap[dept].teamCount++;
      deptMap[dept].studentCount += (p.participants || []).length;
      deptMap[dept].revenue += Number(p.amountRupees || p.amount || 0);

      (p.participants || []).forEach((part) => {
        const campus = classifyCampus(part.college || part.otherCollege || '');
        if (campus === 'AUS') deptMap[dept].aus++;
        else if (campus === 'ACET') deptMap[dept].acet++;
        else deptMap[dept].other++;
        deptMap[dept].participatedStudents++;
      });
    });

    const departmentStats = Object.values(deptMap).map((d) => ({
      dept: d.dept,
      eventCount: d.eventNames.size,
      teamCount: d.teamCount,
      studentCount: d.studentCount,
      aus: d.aus,
      acet: d.acet,
      other: d.other,
      participatedStudents: d.participatedStudents,
      revenue: Math.round(d.revenue * 100) / 100,
    }));

    // ─── Gender stats ─────────────────────────────────────
    const genderMap = { male: 0, female: 0, others: 0 };
    participants.forEach((p) => {
      const g = (p.gender || '').toLowerCase();
      if (g === 'male') genderMap.male++;
      else if (g === 'female') genderMap.female++;
      else genderMap.others++;
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

    return res.json({
      totalTeams,
      totalStudents,
      yearCounts,
      campusWise: campusMap,
      departmentStats,
      genderStats: genderMap,
      campusGenderStats: campusGenderMap,
      accommodation: {
        yes: accommodationYes,
        no: accommodationNo,
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

    // Verify EVENT_COORDINATOR and FACULTY_COORDINATOR access
    const activeRole = req.headers['active-role'];
    if (activeRole === 'EVENT_COORDINATOR' || activeRole === 'FACULTY_COORDINATOR') {
      const jwt = require('jsonwebtoken');
      const token = (req.headers.authorization && req.headers.authorization.split(' ')[1]) || req.cookies?.token;
      let authorized = false;
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          const empId = decoded.institutionId;
          if (empId) {
            const Group = require('../Group/Group.model');
            const Events = require('../Events/Events.model');
            
            const myGroups = await Group.find({ 'eventCoordinator.employeeId': empId }).select('name');
            const myGroupNames = myGroups.map(g => g.name.toLowerCase());

            const myEvents = await Events.find({
                $or: [
                    { 'conveners.employeeId': empId },
                    { 'facultyCoordinators.employeeId': empId },
                    { 'facultyCoordinator.employeeId': empId }
                ]
            }).select('eventName');
            const myEventNames = myEvents.map(e => e.eventName.toLowerCase());

            if (
              myGroupNames.includes((registration.schoolId || '').toLowerCase()) ||
              myEventNames.includes((registration.eventName || '').toLowerCase())
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
      return res.status(400).json({ error: 'Participant has already been marked as attended.', participant, eventName: registration.eventName });
    }

    // Mark as attended
    registration.participants[participantIndex].attended = true;
    registration.markModified('participants');
    await registration.save();

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

    const activeRole = req.headers['active-role'];
    if (activeRole === 'EVENT_COORDINATOR' || activeRole === 'FACULTY_COORDINATOR') {
      const jwt = require('jsonwebtoken');
      const token = (req.headers.authorization && req.headers.authorization.split(' ')[1]) || req.cookies?.token;
      let authorized = false;
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          const empId = decoded.institutionId;
          if (empId) {
            const Group = require('../Group/Group.model');
            const Events = require('../Events/Events.model');
            
            const myGroups = await Group.find({ 'eventCoordinator.employeeId': empId }).select('name');
            const myGroupNames = myGroups.map(g => g.name.toLowerCase());

            const myEvents = await Events.find({
                $or: [
                    { 'conveners.employeeId': empId },
                    { 'facultyCoordinators.employeeId': empId },
                    { 'facultyCoordinator.employeeId': empId }
                ]
            }).select('eventName');
            const myEventNames = myEvents.map(e => e.eventName.toLowerCase());

            if (
              myGroupNames.includes((registration.schoolId || '').toLowerCase()) ||
              myEventNames.includes((registration.eventName || '').toLowerCase())
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
