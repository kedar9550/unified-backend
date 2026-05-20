const express = require('express');
const router = express.Router();
const axios = require('axios');

// @desc    Proxy to Clarivate WoS public rank-search API
// @route   POST /api/research/journal/wos-type
// @access  Public
router.post('/wos-type', async (req, res) => {
    const { issn } = req.body;

    if (!issn) {
        return res.status(400).json({ success: false, message: 'issn is required' });
    }

    try {
        const response = await axios.post(
            'https://mjl.clarivate.com/api/mjl/jprof/public/rank-search',
            {
                searchValue:      issn,
                pageNum:          1,
                pageSize:         10,
                sortOrder:        [{ name: 'RELEVANCE', order: 'DESC' }],
                filters: [{
                    filterName:    'COVERED_LATEST_JEDI',
                    matchType:     'BOOLEAN_EXACT',
                    caseSensitive: false,
                    values:        [{ type: 'VALUE', value: 'true' }]
                }],
                searchIdentifier: 'proxy-' + Date.now()
            },
            {
                headers: {
                    'Accept':        'application/json',
                    'Content-Type':  'application/json',
                    'x-1p-appid':    'mjl',
                    'origin':        'https://mjl.clarivate.com',
                    'referer':       'https://mjl.clarivate.com/search-results',
                    'authorization': 'Bearer'
                }
            }
        );

        const profiles = response.data?.journalProfiles || [];
        const types = new Set();

        profiles.forEach(p => {
            const jp = p?.journalProfile || {};

            // ✅ CORRECT PATH: jcrCategories[].jcrEdition → "SCIE", "ESCI", "SSCI", "AHCI"
            const jcrCategories = jp.jcrCategories || [];
            jcrCategories.forEach(cat => {
                const edition = (cat?.jcrEdition || '').toUpperCase();
                if (edition === 'SCIE')      types.add('SCIE');
                else if (edition === 'SCI')  types.add('SCI');
                if (edition === 'ESCI')      types.add('ESCI');
                if (edition === 'SSCI')      types.add('SSCI');
                if (edition === 'AHCI')      types.add('AHCI');
            });

            // Also check products[] — productCode "D" = SCIE, "C" = SSCI, "A" = AHCI
            // as a secondary fallback
            if (types.size === 0) {
                const products = jp.products || [];
                products.forEach(prod => {
                    const desc = (prod?.description || '').toUpperCase();
                    if (desc.includes('SCIENCE CITATION INDEX EXPANDED')) types.add('SCIE');
                    else if (desc.includes('SCIENCE CITATION INDEX'))     types.add('SCI');
                    if (desc.includes('SOCIAL SCIENCES CITATION'))        types.add('SSCI');
                    if (desc.includes('ARTS & HUMANITIES'))               types.add('AHCI');
                    if (desc.includes('EMERGING SOURCES'))                types.add('ESCI');
                });
            }
        });

        if (types.size > 0) types.add('WoS');

        return res.json({
            success:      true,
            inWoS:        types.size > 0,
            journalType:  types.size > 0 ? [...types].join(' / ') : null,
            totalRecords: response.data?.totalRecords || 0
        });

    } catch (err) {
        const status  = err.response?.status || 500;
        const message = err.response?.data   || err.message;
        console.error('Clarivate proxy error:', status, message);
        return res.status(status).json({ success: false, message });
    }
});

module.exports = router;
