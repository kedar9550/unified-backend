const Inquiry = require('./Inquiry.model');

// Helper function to send email notification (optional SMTP / console logger)
const sendNotificationEmail = async (inquiry) => {
  try {
    let nodemailer;
    try {
      nodemailer = require('nodemailer');
    } catch (e) {
      console.log('[INQUIRY EMAIL] Nodemailer module not installed. Inquiry details logged:');
      console.log(`To: veda2026@adityauniversity.in, ${inquiry.email}`);
      console.log(`Subject: New Inquiry: ${inquiry.subject}`);
      console.log(`Message: ${inquiry.message}`);
      return;
    }

    const receiverEmail = process.env.RECEIVER_EMAIL || 'veda2026@adityauniversity.in';
    const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
    const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

    if (smtpUser && smtpPass) {
      const transporter = process.env.SMTP_HOST
        ? nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: { user: smtpUser, pass: smtpPass },
          })
        : nodemailer.createTransport({
            service: 'gmail',
            auth: { user: smtpUser, pass: smtpPass },
          });

      const mailOptions = {
        from: `"VEDA 2026 Portal" <${smtpUser}>`,
        to: `${receiverEmail}, ${inquiry.email}`,
        subject: `[VEDA 2026] Inquiry Received: ${inquiry.subject}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #013c6e;">New Inquiry Received - VEDA 2026</h2>
            <p>Thank you for reaching out to us. We have received your query details:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 8px; font-weight: bold; width: 120px;">Name:</td><td style="padding: 8px;">${inquiry.name}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Email:</td><td style="padding: 8px;">${inquiry.email}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Phone:</td><td style="padding: 8px;">${inquiry.phone || 'N/A'}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Subject:</td><td style="padding: 8px;">${inquiry.subject}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Message:</td><td style="padding: 8px;">${inquiry.message || 'N/A'}</td></tr>
            </table>
            <p style="color: #666; font-size: 0.9em;">Our organizing team will get back to you shortly.</p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log(`[INQUIRY EMAIL] Sent email to ${inquiry.email}`);
    } else {
      console.log(`[INQUIRY EMAIL] SMTP not configured. Notification for inquiry ${inquiry._id} logged successfully.`);
    }
  } catch (err) {
    console.error('[INQUIRY EMAIL ERROR]', err);
  }
};

// Create new inquiry and store in Database
exports.createInquiry = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !subject || subject === 'Select') {
      return res.status(400).json({
        success: false,
        error: 'Please fill in all required fields (Name, Email, Query Subject).',
      });
    }

    const inquiry = await Inquiry.create({
      name,
      email,
      phone: phone || '',
      subject,
      message: message || '',
    });

    // Trigger email notification asynchronously
    sendNotificationEmail(inquiry);

    return res.status(201).json({
      success: true,
      message: 'Inquiry submitted successfully! Our team will contact you shortly.',
      data: inquiry,
    });
  } catch (error) {
    console.error('Error creating inquiry:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to submit inquiry. Please try again later.',
    });
  }
};

// Get all inquiries (Admin route)
exports.getAllInquiries = async (req, res) => {
  try {
    const inquiries = await Inquiry.find().sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: inquiries.length,
      data: inquiries,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
