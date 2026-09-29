const express = require("express");
const router = express.Router();
const { getRazorpayStatement } = require("./transaction.controller");
const { protect } = require("../../middlewares/authMiddleware");

// All payment routes require JWT authentication
router.use(protect);

router.route("/razorpay")
    .get(getRazorpayStatement);

module.exports = router;


