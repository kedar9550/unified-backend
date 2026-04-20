/**
 * Placeholder for an SMS Provider Integration (e.g. Twilio, MSG91)
 */
const sendOtpSms = async (phone, name, otp) => {
    // Implement real SMS Gateway logic here
    console.log(`[SMS SIMULATION] Sending OTP to ${name} at ${phone}. OTP: ${otp}`);
    return true;
};

module.exports = sendOtpSms;
