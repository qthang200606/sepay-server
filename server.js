const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

// Đọc từ biến môi trường thay vì file .json
const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!serviceAccountRaw) {
    console.error("LỖI: Chưa cấu hình biến FIREBASE_SERVICE_ACCOUNT trên Render!");
    process.exit(1); 
}

const serviceAccount = JSON.parse(serviceAccountRaw);

// Quan trọng: Fix lỗi ký tự xuống dòng cho Private Key
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();

app.use(cors());
app.use(express.json());
// WEBHOOK SEPAY
app.post("/sepay-webhook", async (req, res) => {

    try {

        console.log("Webhook received:", req.body);

        // dữ liệu từ SePay
        const content = req.body.content || "";

        // tìm ORDER_xxx trong nội dung chuyển khoản
        const match = content.match(/ORDER_\d+/);

        if (!match) {
            return res.status(400).send("Order ID not found");
        }

        const orderId = match[0];

        // update Firestore
        await db.collection("orders")
            .doc(orderId)
            .update({
                paymentStatus: "PAID"
            });

        console.log("Payment success:", orderId);

        res.status(200).send("OK");

    } catch (error) {

        console.error(error);

        res.status(500).send(error.message);
    }
});

app.get("/", (req, res) => {
    res.send("SePay webhook running");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});