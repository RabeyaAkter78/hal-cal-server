const express = require("express");
const cors = require("cors");
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// Create directory for saving uploaded images
const uploadDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Set up storage with destination and filename configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hwapsgs.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    await client.connect();

    const db = client.db("chatApp");
    const usersCollection = db.collection("users");

    // Handle user registration with image upload
    app.post("/auth", upload.single("avatar"), async (req, res) => {
      try {
        const { name, email, password } = req.body;
        let avatarUrl = null;

        if (req.file) {
          avatarUrl = `/uploads/${req.file.filename}`;
        }

        const user = { name, email, password, avatarUrl };
        const result = await usersCollection.insertOne(user);
        res
          .status(201)
          .json({
            success: true,
            registerUserId: result.insertedId,
            file: req.file,
          });
      } catch (error) {
        console.error("Error saving user:", error);
        res
          .status(500)
          .json({ success: false, error: "Internal Server Error" });
      }
    });

    // Serve the uploaded images statically
    app.use("/uploads", express.static(uploadDir));

    // Handle user login
    app.post("/auth/login", async (req, res) => {
      const userInfo = req.body;
      const existingUser = await usersCollection.findOne({
        email: userInfo?.email,
      });

      if (!existingUser) {
        return res.status(400).json({
          message: "User Does Not Exist",
          success: false,
          data: {},
        });
      }

      res.status(200).json({
        message: "Login Successful",
        success: true,
        data: existingUser,
      });
    });

    // Get users excluding the logged-in user
    app.get("/users/:id", async (req, res) => {
      const loggedInUserId = req.params.id;

      try {
        const users = await usersCollection
          .find({ _id: { $ne: new ObjectId(loggedInUserId) } })
          .toArray();
        res.json({ data: users });
      } catch (error) {
        console.error("Failed to fetch users:", error);
        res.status(500).json({ error: "Failed to fetch users" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB successfully!");
  } catch (error) {
    console.error("An error occurred while connecting to MongoDB:", error);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Socket.IO server is running");
});

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
