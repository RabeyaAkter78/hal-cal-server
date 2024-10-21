const express = require("express");
const cors = require("cors");
require("dotenv").config();
const path = require("path"); //for file upload
const fs = require("fs"); //require file system
const multer = require("multer"); //for upload photo
const http = require("http"); //require server for socket
const { Server } = require("socket.io");
const app = express();
const port = process.env.PORT || 5000;
const server = http.createServer(app);
const {
  MongoClient,
  ServerApiVersion,
  ObjectId,
  Timestamp,
} = require("mongodb");
const { timeStamp } = require("console");

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
    const messageCollection = db.collection("messages");

    // Handle user registration with image upload and emit thge user on socket to get users on realtime for every user.
    app.post("/auth", upload.single("avatar"), async (req, res) => {
      try {
        const { name, email, password } = req.body;
        let avatarUrl = null;

        if (req.file) {
          avatarUrl = `/uploads/${req.file.filename}`;
        }

        const user = { name, email, password, avatarUrl };

        const result = await usersCollection.insertOne(user);
        res.status(201).json({
          success: true,
          registerUserId: result.insertedId,
          file: req.file,
        });
        //emit the user on socket:
        io.emit("user", user);
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

    // Get users except the logged-in user:
    app.get("/users/:id", async (req, res) => {
      const loggedInUserId = req.params.id;

      if (!ObjectId.isValid(loggedInUserId)) {
        return res.status(400).json({ err: "Invalid user id" });
      }

      try {
        const users = await usersCollection
          .find({ _id: { $ne: new ObjectId(loggedInUserId) } }) //ne= not equal
          .sort({ _id: -1 })
          .toArray();
        res.json({ data: users });
      } catch (error) {
        console.error("Failed to fetch users:", error);
        res.status(500).json({ error: "Failed to fetch users" });
      }
    });

    // // get single user:
    // app.get("/single-user/:id", async (req, res) => {
    //   const userId = req.params.id;

    //   if (!userId || !ObjectId.isValid(userId)) {
    //     return res.status(400).json({ error: "Invalid or missing user ID" });
    //   }
    //   console.log("myId 138", userId);

    //   try {
    //     const objectId = new ObjectId(userId);

    //     const user = await usersCollection.findOne({ _id: objectId });
    //     if (!user) {
    //       return res.status(404).json({ message: "User not found" });
    //     }
    //     return res.status(200).json({
    //       message: "Get Single User",
    //       success: true,
    //       data: user,
    //     });
    //   } catch (error) {
    //     return res.status(500).json({
    //       message: "Error fetching user",
    //       success: false,
    //       error: error.message,
    //     });
    //   }
    // });

    // app.get("/single-user/:id", async (req, res) => {
    //   const userId = req.params.id;

    //   if (!userId || !ObjectId.isValid(userId)) {
    //     return res.status(400).json({ error: "Invalid or missing user ID" });
    //   }
    //   console.log("myId 138", userId); //todo not getting my id:
    //   try {
    //     const objectId = new ObjectId(userId);

    //     const user = await usersCollection.findOne({ _id: objectId });
    //     if (!user) {
    //       return res.status(404).json({ message: "User not found" });
    //     }
    //     return res.status(200).json({
    //       message: "Get Single User",
    //       success: true,
    //       data: user,
    //     });
    //   } catch (error) {
    //     return res.status(500).json({
    //       message: "Error fetching user",
    //       success: false,
    //       error: error.message,
    //     });
    //   }
    // });

    // socket io:
    const io = new Server(server, {
      cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
      },
    });

    const users = {};
    io.on("connection", (socket) => {
      console.log("A user is Connected:", socket.id);

      socket.on("register", (userId) => {
        users[userId] = socket.id;
      });

      // sendMessage:
      socket.on("sendMessage", async (data) => {
        console.log(data);
        const { senderId, receiverId, text } = data;
        // message save on database:
        const messages = await messageCollection.insertOne({
          senderId,
          receiverId,
          text,
          Timestamp: new Date(),
        });
        console.log(messages);
        // send real time data to sender and receiver:
        // all ids will be here:
        const ids = [senderId, receiverId];
        ids.forEach((id) => {
          io.emit(`receiverMessage:${id}`, { text, senderId });
        });

        // io.emit(`receiverMessage:${senderId}`, { text, senderId });
        // io.emit(`receiverMessage:${receiverId}`, { text, senderId });
      });

      // get conversation of two users:
      app.get("/conversation/:user1Id/:user2Id", async (req, res) => {
        const { user1Id, user2Id } = req.params;
        console.log(user1Id, user2Id);

        const conversation = await messageCollection
          .find({
            $or: [
              { senderId: user1Id, receiverId: user2Id },
              { senderId: user2Id, receiverId: user1Id },
            ],
          })
          .sort({ timeStamp: 1 })
          .toArray();
        res.json(conversation);
      });

      // disconnect socket io:
      socket.on("disconnect", () => {
        console.log("user Disconnected", socket.id);
        // Remove the user from the users object:
        for (const userId in users) {
          if (users[userId] === socket.id) {
            delete users[userId];
            break;
          }
        }
      });
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

server.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
