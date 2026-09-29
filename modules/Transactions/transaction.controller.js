// @desc    Fetch Razorpay statement transactions for a specified date range
// @route   GET /api/payments/razorpay
// @access  Private
const getRazorpayStatement = async (req, res) => {
    try {
        const { fromDate, toDate } = req.query;

        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret) {
            return res.status(400).json({
                success: false,
                message: "Razorpay Key ID or Key Secret is not configured in .env file"
            });
        }

        // Calculate Unix timestamps in seconds
        let fromTimestamp;
        let toTimestamp;

        if (fromDate) {
            fromTimestamp = Math.floor(new Date(`${fromDate}T00:00:00`).getTime() / 1000);
        } else {
            // Default to start of today (local time)
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            fromTimestamp = Math.floor(today.getTime() / 1000);
        }

        if (toDate) {
            toTimestamp = Math.floor(new Date(`${toDate}T23:59:59`).getTime() / 1000);
        } else {
            // Default to end of today
            const today = new Date();
            today.setHours(23, 59, 59, 999);
            toTimestamp = Math.floor(today.getTime() / 1000);
        }

        const authHeader = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
        
        // Fast parallel batch fetching (up to 1,000 items max per statement request for instant response)
        let items = [];
        let batchSkip = 0;
        const batchSize = 5; // 5 parallel requests * 100 = 500 items per round trip
        const maxLimit = 1000;
        let keepFetching = true;

        while (keepFetching && items.length < maxLimit) {
            const promises = [];
            const axios = require('axios');
            for (let i = 0; i < batchSize; i++) {
                const skipVal = batchSkip + (i * 100);
                if (skipVal >= maxLimit) break;
                const razorpayUrl = `https://api.razorpay.com/v1/payments?from=${fromTimestamp}&to=${toTimestamp}&count=100&skip=${skipVal}`;
                
                promises.push(
                    axios.get(razorpayUrl, {
                        headers: {
                            "Authorization": authHeader,
                            "Content-Type": "application/json"
                        },
                        timeout: 10000 // 10s timeout
                    }).then(r => r.data).catch(e => ({ items: [] }))
                );
            }

            const results = await Promise.all(promises);
            let addedInBatch = 0;
            let hitEnd = false;

            for (const resData of results) {
                const fetched = resData.items || [];
                items = items.concat(fetched);
                addedInBatch += fetched.length;
                if (fetched.length < 100) {
                    hitEnd = true;
                }
            }

            if (hitEnd || addedInBatch === 0) {
                keepFetching = false;
            } else {
                batchSkip += (batchSize * 100);
            }
        }

        let totalAmount = 0;
        let totalFee = 0;
        let totalTax = 0;
        let totalRefunds = 0;

        const formattedPayments = items.map((item) => {
            const amountInInr = (item.amount || 0) / 100;
            const feeInInr = (item.fee || 0) / 100;
            const taxInInr = (item.tax || 0) / 100;
            const refundInInr = (item.amount_refunded || 0) / 100;
            const netAmountInInr = amountInInr - feeInInr;

            totalAmount += amountInInr;
            totalFee += feeInInr;
            totalTax += taxInInr;
            totalRefunds += refundInInr;

            // Format date & time string
            const createdDate = item.created_at ? new Date(item.created_at * 1000) : new Date();
            const dateStr = createdDate.toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });

            // Extract acquirer reference / method details
            let methodDetail = '';
            if (item.method === 'upi') {
                const vpa = item.vpa || item.upi?.vpa || '';
                const rrn = item.acquirer_data?.rrn || item.acquirer_data?.bank_transaction_id || '';
                methodDetail = `VPA: ${vpa}${rrn ? ' | RRN: ' + rrn : ''}`;
            } else if (item.method === 'wallet') {
                methodDetail = `Wallet: ${item.wallet || 'N/A'}`;
            } else if (item.method === 'card') {
                methodDetail = `Card ${item.card?.network || ''} ${item.card?.last4 ? '**** ' + item.card.last4 : ''}`;
            } else if (item.method === 'netbanking') {
                methodDetail = `Bank: ${item.bank || 'N/A'}`;
            }

            // Map status
            let statusText = 'PENDING';
            if (item.status === 'captured') statusText = 'CAPTURED';
            else if (item.status === 'failed') statusText = 'FAILED';
            else if (item.status === 'refunded') statusText = 'REFUNDED';
            else if (item.status === 'authorized') statusText = 'AUTHORIZED';

            return {
                paymentId: item.id,
                orderId: item.order_id || 'N/A',
                invoiceId: item.invoice_id || null,
                createdAt: dateStr,
                timestamp: item.created_at,
                customerEmail: item.email || 'N/A',
                customerPhone: item.contact || 'N/A',
                description: item.description || (item.notes?.description) || 'Event Payment',
                amount: amountInInr,
                fee: feeInInr,
                tax: taxInInr,
                refundAmount: refundInInr,
                netAmount: netAmountInInr,
                status: statusText,
                rawStatus: item.status,
                method: (item.method || 'UPI').toUpperCase(),
                methodDetail,
                rrn: item.acquirer_data?.rrn || '',
                vpa: item.vpa || '',
                wallet: item.wallet || '',
                rawJson: item
            };
        });

        const netTotal = totalAmount - totalFee;

        return res.status(200).json({
            success: true,
            source: "razorpay",
            dateRange: {
                fromDate: fromDate || new Date(fromTimestamp * 1000).toISOString().split('T')[0],
                toDate: toDate || new Date(toTimestamp * 1000).toISOString().split('T')[0]
            },
            summary: {
                totalTransactions: formattedPayments.length,
                totalAmount: Number(totalAmount.toFixed(2)),
                totalFee: Number(totalFee.toFixed(2)),
                totalTax: Number(totalTax.toFixed(2)),
                totalRefunds: Number(totalRefunds.toFixed(2)),
                netAmount: Number(netTotal.toFixed(2))
            },
            payments: formattedPayments
        });

    } catch (error) {
        console.error("Get Razorpay Statement Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Error fetching Razorpay statement: " + error.message
        });
    }
};

module.exports = {
    getRazorpayStatement
};

