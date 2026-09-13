const admin = require("firebase-admin");

let firebaseAdmin = null;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    firebaseAdmin = admin.apps.length
      ? admin.app()
      : admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
  } else {
    console.warn("[Firebase Warning] Thiếu biến môi trường FIREBASE_SERVICE_ACCOUNT.");
  }
} catch (error) {
  console.warn("[Firebase Warning] Không thể khởi tạo Firebase Admin:", error.message);
}

module.exports = firebaseAdmin;
