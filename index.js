const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const path = require("path");
const http = require("http");
const multer = require("multer");
const fs = require("fs");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const port = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());
// create directory for save the upload image:

const uploadDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
// Set up storage with destination and filename configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Save files in the public/uploads directory
    cb(null, path.join(__dirname, "public", "uploads"));
  },
  filename: function (req, file, cb) {
    // Use a unique filename with the original file extension
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
    const messagesCollection = db.collection("messages");
    const usersCollection = db.collection("users");

    // Handle user registration with image upload
    app.post("/auth", upload.single("avatar"), async (req, res) => {
      try {
        // const userInfo = req.body;
        // console.log(userInfo);

        const { name, email, password } = req.body;
        let avatarUrl = null;

        // Check if a file is uploaded and construct the avatar URL
        if (req.file) {
          avatarUrl = `/uploads/${req.file.filename}`;
        }

        // Create a user object to be inserted into the database
        const user = {
          name,
          email,
          password,
          avatarUrl,
        };

        // Insert the user into the database
        const result = await usersCollection.insertOne(user);
        const registerUserId = result.insertedId;
        // console.log(registerUserId);
        // Send a response once after successfully saving the user
        res.status(201).json({ success: true, registerUserId, file: req.file });
        // .json({ success: true, userId: result.insertedId, file: req.file });
      } catch (error) {
        console.error("Error saving user:", error);
        // Send an error response if something goes wrong
        res
          .status(500)
          .json({ success: false, error: "Internal Server Error" });
      }
    });

    // Serve the uploaded images statically
    app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));
    app.post("/auth/login", async (req, res) => {
      const userInfo = req.body;
      console.log(userInfo);

      const alreadyExist = await usersCollection.findOne({
        email: userInfo?.email,
      });
      console.log("data", alreadyExist);

      if (!alreadyExist) {
        return res.status(400).json({
          message: "User Does Not Exists",
          success: false,
          data: {},
        });
      } else {
        return res.status(200).json({
          message: "Log In Successfull",
          success: true,
          data: alreadyExist,
        });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } catch (error) {
    console.error("An error occurred while connecting to MongoDB:", error);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Socket.IO server is running");
});

app.listen(port, () => {
  console.log(`Socket.IO server is running on port: ${port}`);
});
