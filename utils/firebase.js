const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const serviceAccount = require('../config/firebase-service-account.json');

try {
    if (getApps().length === 0) {
        initializeApp({
            credential: cert(serviceAccount)
        });
        console.log("Firebase Admin Initialized Successfully");
    }
} catch (error) {
    console.error("Firebase Admin Initialization Error", error.stack);
}

module.exports = {
    messaging: () => getMessaging()
};
