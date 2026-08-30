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
    const smtpHost = process.env.SMTP_HOST || 'smtp.office365.com';
    const smtpPort = Number(process.env.SMTP_PORT) || 587;
    const smtpSecure = process.env.SMTP_SECURE === 'true';

    if (smtpUser && smtpPass) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
        tls: {
          ciphers: 'SSLv3',
          rejectUnauthorized: false,
        },
      });

      const targetEmails = new Set();
      if (receiverEmail) {
        receiverEmail.split(',').forEach((email) => {
          if (email && email.trim()) targetEmails.add(email.trim());
        });
      }
      if (inquiry.email && inquiry.email.trim()) {
        targetEmails.add(inquiry.email.trim());
      }

      const mailOptions = {
        from: `"VEDA 2026 Portal" <${smtpUser}>`,
        to: Array.from(targetEmails).join(', '),
        replyTo: inquiry.email,
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
      console.log(`[INQUIRY EMAIL] Successfully sent email to: ${Array.from(targetEmails).join(', ')}`);
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

// Update inquiry status
exports.updateInquiryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const updatedInquiry = await Inquiry.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!updatedInquiry) {
      return res.status(404).json({
        success: false,
        error: 'Inquiry not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Status updated successfully',
      data: updatedInquiry,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Delete inquiry
exports.deleteInquiry = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedInquiry = await Inquiry.findByIdAndDelete(id);

    if (!deletedInquiry) {
      return res.status(404).json({
        success: false,
        error: 'Inquiry not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Inquiry deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
