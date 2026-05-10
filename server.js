const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

// 1. Đọc cấu hình từ biến môi trường
const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!serviceAccountRaw) {
    console.error("LỖI: Chưa cấu hình biến FIREBASE_SERVICE_ACCOUNT trên Render!");
    process.exit(1); 
}

const serviceAccount = JSON.parse(serviceAccountRaw);
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

// 2. Khởi tạo Firebase
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();

app.use(cors());
app.use(express.json());

// 3. WEBHOOK SEPAY
app.post("/sepay-webhook", async (req, res) => {
    try {
        console.log("==> Webhook nhận dữ liệu:", req.body);
        const content = req.body.content || "";
        
        // RegEx này bóc tách phần SỐ sau chữ ORDER
        const match = content.match(/ORDER[_-]?(\d+)/i);

        if (!match) {
            console.log("❌ Không tìm thấy mã ORDER trong nội dung:", content);
            return res.status(400).send("Order ID not found");
        }

        // Lấy dãy số (ví dụ: 1778392918377) và ghép lại cho đúng dạng ORDER_
        const orderId = `ORDER_${match[1]}`; 

        console.log("🔍 Đang tìm và cập nhật đơn hàng:", orderId);

        const orderRef = db.collection("orders").doc(orderId);
        const doc = await orderRef.get();

        if (!doc.exists) {
            console.log("❌ LỖI: ID này không tồn tại trong Firestore:", orderId);
            return res.status(404).send("Document not found");
        }

        await orderRef.update({
            paymentStatus: "PAID",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log("✅ Cập nhật THÀNH CÔNG đơn hàng:", orderId);
        res.status(200).send("OK");
    } catch (error) {
        console.error("🔥 Lỗi xử lý:", error);
        res.status(500).send(error.message);
    }
});

app.get("/", (req, res) => {
    res.send("SePay webhook running");
});

// 4. Khởi chạy Server
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});