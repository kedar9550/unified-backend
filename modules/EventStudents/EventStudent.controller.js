const EventStudent = require('./EventStudent.model');
const bcrypt = require('bcryptjs');

exports.registerStudent = async (req, res) => {
  try {
    const { name, college, otherCollege, roll, gender, mobile, email, password } = req.body;

    if (!name || !college || !roll || !gender || !mobile || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existing = await EventStudent.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered. Please login instead.' });
    }

    const plainPassword = password || '123456';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(plainPassword, salt);

    const newStudent = new EventStudent({
      name,
      college,
      otherCollege,
      roll,
      gender,
      mobile,
      email,
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
    
    const student = await EventStudent.findOne({ email });
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
