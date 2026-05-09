const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();

app.use(cors());
app.use(express.json());

// Firebase Admin SDK
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

app.post("/sepay-webhook", async (req, res) => {

    try {

        const body = req.body;

        console.log(body);

        const orderId = body.content?.trim();

        if (!orderId) {
            return res.status(400).send("Missing orderId");
        }

        await db.collection("orders")
            .doc(orderId)
            .update({
                paymentStatus: "PAID"
            });

        return res.status(200).send("OK");

    } catch (e) {

        console.error(e);

        return res.status(500).send("ERROR");
    }
});

app.get("/", (req, res) => {
    res.send("SePay Server Running");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});