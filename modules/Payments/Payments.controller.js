const paymentsService = require('./Payments.service');
const PaymentRegistration = require('./PaymentRegistration.model');

exports.createOrder = async (req, res) => {
  try {
    const { amount: frontendAmount, eventId, teamSize, extraTeamSize, currency, receipt } = req.body;
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
  if (['STUDENT_EVENT_ADMIN', 'ADMIN', 'SUPER_ADMIN', 'MANAGEMENT', 'DEVELOPER'].includes(role)) {
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
    const { email, roll, teamId } = req.query;
    const andConditions = [];

    const roleFilter = await getRoleFilterQuery(req);
    if (Object.keys(roleFilter).length > 0) {
      andConditions.push(roleFilter);
    }

    if (teamId && teamId.trim()) {
      const cleanTeamId = teamId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      andConditions.push({ teamId: { $regex: new RegExp(`^${cleanTeamId}$`, 'i') } });
    }

    if (email && email.trim()) {
      const cleanEmail = email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (roll && roll.trim()) {
        const cleanRoll = roll.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        andConditions.push({
          $or: [
            {
              $and: [
                { 'participants.email': { $regex: new RegExp(`^${cleanEmail}$`, 'i') } },
                { 'participants.roll': { $regex: new RegExp(`^${cleanRoll}$`, 'i') } }
              ]
            },
            { 'participants.email': { $regex: new RegExp(`^${cleanEmail}$`, 'i') } }
          ]
        });
      } else {
        andConditions.push({ 'participants.email': { $regex: new RegExp(`^${cleanEmail}$`, 'i') } });
      }
    } else if (roll && roll.trim()) {
      const cleanRoll = roll.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      andConditions.push({ 'participants.roll': { $regex: new RegExp(`^${cleanRoll}$`, 'i') } });
    }

    const finalQuery = andConditions.length > 0 ? { $and: andConditions } : {};
    let payments = await PaymentRegistration.find(finalQuery).sort({ createdAt: -1 }).lean();

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

    const registration = new PaymentRegistration({
      eventId: eventId || '',
      schoolId: schoolId || '',
      category: category || '',
      eventName: eventName || '',
      amount: amountValue,
      amountRupees: amountValue,
      currency,
      teamId: teamId || '',
      teamSize: Number(teamSize) || 1,
      participants: (Array.isArray(participants) ? participants : []).map(p => ({
        ...p,
        accommodation: p.accommodation || "No",
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

    if (activeRole === 'SCHOOL_COORDINATOR' || activeRole === 'FACULTY_COORDINATOR') {
      const jwt = require('jsonwebtoken');
      const token = (req.headers.authorization && req.headers.authorization.split(' ')[1]) || req.cookies?.token;

      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          const empId = decoded.institutionId;

          if (empId) {
            const EventSchools = require('../EventSchools/EventSchools.model');
            const Events = require('../Events/Events.model');

            const empIdStr = String(empId).trim();
            const empIdNum = Number(empIdStr);
            const empMatch = isNaN(empIdNum) ? [empIdStr] : [empIdStr, empIdNum];

            const mySchools = await EventSchools.find({
              $or: [
                { 'coordinators.employeeId': { $in: empMatch } },
                { 'coordinator.employeeId': { $in: empMatch } }
              ]
            }).select('name');
            const mySchoolNames = mySchools.map(g => new RegExp(`^${g.name}$`, 'i'));

            const myEvents = await Events.find({
              $or: [
                { 'conveners.employeeId': empId },
                { 'facultyCoordinators.employeeId': empId },
                { 'facultyCoordinator.employeeId': empId }
              ]
            }).select('eventName');
            const myEventNames = myEvents.map(e => new RegExp(`^${e.eventName}$`, 'i'));

            query.$or = [
              { schoolId: { $in: mySchoolNames } },
              { eventName: { $in: myEventNames } }
            ];
          }
        } catch (err) {
          console.error('Error decoding token for SCHOOL_COORDINATOR filter in stats', err);
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

    const EventSchools = require('../EventSchools/EventSchools.model');
    const Events = require('../Events/Events.model');
    const EventDepartment = require('../EventDepartment/EventDepartment.model');

    const [allSchools, allEvents, allEventDepts] = await Promise.all([
      EventSchools.find({}).lean(),
      Events.find({}).populate('eventSchool').populate('department').lean(),
      EventDepartment.find({}).sort({ name: 1 }).lean(),
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

    return res.json({
      totalTeams,
      totalStudents,
      totalAttended,
      yearCounts,
      campusWise: campusMap,
      departmentStats,
      schoolStats,
      schoolStats: schoolStats,
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
