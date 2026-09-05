const EventStudent = require('./EventStudent.model');
const PaymentRegistration = require('../Payments/PaymentRegistration.model');
const bcrypt = require('bcryptjs');

exports.registerStudent = async (req, res) => {
  try {
    const { name, college, otherCollege, roll, gender, mobile, email, password } = req.body;

    if (!name || !college || !roll || !gender || !mobile || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const cleanEmail = email.trim();
    const escapedEmail = cleanEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existing = await EventStudent.findOne({
      $or: [
        { email: cleanEmail.toLowerCase() },
        { email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') } }
      ]
    });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered. Please login instead.' });
    }

    const plainPassword = password || '123456';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(plainPassword, salt);

    const newStudent = new EventStudent({
      name: name.trim(),
      college,
      otherCollege,
      roll: roll.trim().toUpperCase(),
      gender,
      mobile: mobile.trim(),
      email: cleanEmail.toLowerCase(),
      password: hashedPassword
    });

    const savedStudent = await newStudent.save();

    return res.status(201).json({ success: true, student: savedStudent });
  } catch (err) {
    console.error('Error registering event student:', err);
    return res.status(500).json({ error: 'Unable to register student', details: err.message });
  }
};

exports.loginStudent = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const cleanEmail = email.trim();
    const escapedEmail = cleanEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const student = await EventStudent.findOne({
      $or: [
        { email: cleanEmail.toLowerCase() },
        { email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') } }
      ]
    });
    if (!student) {
      return res.status(404).json({ error: 'Account not found. Please register.' });
    }
    
    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {
      // Also fallback for existing plaintext passwords during transition
      if (student.password === password) {
        // Option to upgrade hash here, but for now just let them in
      } else {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    }
    
    return res.status(200).json({ success: true, student });
  } catch (err) {
    console.error('Error logging in event student:', err);
    return res.status(500).json({ error: 'Login failed', details: err.message });
  }
};

exports.updateStudent = async (req, res) => {
  try {
    const { id, name, college, otherCollege, roll, gender, mobile, email } = req.body;
    if (!id || !roll) {
      return res.status(400).json({ error: 'ID and Roll Number are required' });
    }

    const cleanRoll = roll.trim().toUpperCase();
    const updateData = {
      name,
      college,
      otherCollege,
      roll: cleanRoll,
      gender,
      mobile: mobile ? mobile.trim() : mobile
    };
    if (email) {
      updateData.email = email.trim().toLowerCase();
    }

    const updatedStudent = await EventStudent.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    if (!updatedStudent) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Update the participant mobile number in paymentregistrations matching the roll number
    if (mobile) {
      await PaymentRegistration.updateMany(
        { "participants.roll": cleanRoll },
        { "$set": { "participants.$[elem].mobile": mobile } },
        { arrayFilters: [{ "elem.roll": cleanRoll }] }
      );
    }

    return res.status(200).json({ success: true, student: updatedStudent });
  } catch (err) {
    console.error('Error updating event student:', err);
    return res.status(500).json({ error: 'Unable to update student', details: err.message });
  }
};
