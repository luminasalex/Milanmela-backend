import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { jwt } from "better-auth/plugins";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be a valid port number between 1 and 65535");
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is required");
}

const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL;
if (!BETTER_AUTH_URL) {
  throw new Error("BETTER_AUTH_URL is required");
}

const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET;
if (!BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is required");
}

const client = new MongoClient(MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
    throw err;
  }
}

const mongodbConnection = await connectToMongoDB();

const db = mongodbConnection.db("Milanmela");
const eventsCollection = db.collection("events");
const auth = betterAuth({
  baseURL: BETTER_AUTH_URL,
  secret: BETTER_AUTH_SECRET,
  database: mongodbAdapter(db, { client }),
  plugins: [
    jwt({
      jwt: {
        issuer: BETTER_AUTH_URL,
        audience: BETTER_AUTH_URL,
      },
    }),
  ],
});

// Middleware
app.use(express.json());
app.use(cors());

app.use(async (req, res, next) => {
  const isPublicEventRequest =
    req.method === "GET" &&
    (req.path === "/" ||
      req.path === "/events" ||
      /^\/events\/[^/]+$/.test(req.path));

  if (isPublicEventRequest) {
    return next();
  }

  const authorization = req.headers.authorization || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return res.status(401).json({ message: "An auth token is required" });
  }

  try {
    const result = await auth.api.verifyJWT({ body: { token } });
    const payload = result.payload;
    if (
      !payload ||
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string"
    ) {
      return res.status(401).json({ message: "The auth token is invalid" });
    }

    req.authUser = {
      id: payload.sub,
      email: payload.email.trim(),
    };
    return next();
  } catch (error) {
    console.error("Auth token verification failed:", error);
    return res.status(500).json({ message: "Could not verify auth token" });
  }
});

app.post("/create-event", async (req, res) => {
  const eventData = {
    ...req.body,
    creatorEmail: req.authUser.email,
  };
  const insertResult = await eventsCollection.insertOne(eventData);

  console.log(insertResult);

  res.send({ massege: "Event created successfully", result: insertResult });
});

app.get("/events", async (req, res) => {
  const cursor = await eventsCollection.find().toArray();
  res.send(cursor);
});

app.get("/events/:id", async (req, res) => {
  const { id } = req.params;
  const cursor = await eventsCollection.findOne({ _id: new ObjectId(id) });
  res.send(cursor);
});

app.get("/my-events", async (req, res) => {
  const cursor = await eventsCollection
    .find({ creatorEmail: req.authUser.email })
    .toArray();
  res.send(cursor);
});

app.get("/joined-events", async (req, res) => {
  try {
    const joinedEvents = await eventsCollection
      .find({ joinedBy: req.authUser.email.toLowerCase() })
      .toArray();
    res.status(200).json(joinedEvents);
  } catch (error) {
    console.error("Joined events fetch error:", error);
    res.status(500).json({ message: "Failed to fetch joined events" });
  }
});

app.post("/events/:id/join", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid event ID" });
    }

    const result = await eventsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $addToSet: { joinedBy: req.authUser.email.toLowerCase() } },
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    res.status(200).json({ success: true, message: "Joined event successfully" });
  } catch (error) {
    console.error("Join event error:", error);
    res.status(500).json({ message: "Failed to join event" });
  }
});

// Delete
app.delete("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ ID valid kina check kori
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid event ID" });
    }

    // 2️⃣ Delete kori
    const result = await eventsCollection.deleteOne({
      _id: new ObjectId(id),
      creatorEmail: req.authUser.email,
    });

    // 3️⃣ Event na pele 404
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    // 4️⃣ Success
    res.status(200).json({
      success: true,
      message: "Event deleted successfully",
      deletedId: id,
    });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ message: "Failed to delete event" });
  }
});

// Edit
app.put("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      date,
      location,
      price,
      image,
      imageUrl,
      category,
      startTime,
      endTime,
    } = req.body;

    // 1️⃣ ID valid kina check kori
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid event ID" });
    }

    // 2️⃣ Required field validation (jei field gulo mandatory)
    if (!title || !description || !date || !location) {
      return res.status(400).json({
        message: "title, description, date, and location are required",
      });
    }

    // 3️⃣ Update data object toiri kori
    const updatedData = {
      title,
      description,
      date,
      location,
      price: price ?? 0,
      image: imageUrl ?? image ?? "",
      imageUrl: imageUrl ?? image ?? "",
      category: category ?? "general",
      updatedAt: new Date(),
    };
    if (startTime !== undefined) updatedData.startTime = startTime;
    if (endTime !== undefined) updatedData.endTime = endTime;

    // 4️⃣ Update kori
    const result = await eventsCollection.updateOne(
      { _id: new ObjectId(id), creatorEmail: req.authUser.email },
      { $set: updatedData },
    );

    // 5️⃣ Event na pele 404
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    // 6️⃣ Success
    res.status(200).json({
      success: true,
      message: "Event updated successfully",
      updatedId: id,
      data: updatedData,
    });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ message: "Failed to update event" });
  }
});

// http://localhost:5000/my-events/
// Routes
app.get("/", (req, res) => {
  res.send("Server is running");
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;