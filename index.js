import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const mongodbConnection = await connectToMongoDB();

const db = mongodbConnection.db("Milanmela");
const eventsCollection = db.collection("events");

// Middleware
app.use(express.json());
app.use(cors());

app.post("/create-event", async (req, res) => {
  const eventData = req.body;
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

app.get("/my-events/:email", async (req, res) => {
  const { email } = req.params;
  const cursor = await eventsCollection.find({ creatorEmail: email }).toArray();
  res.send(cursor);
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

// http://localhost:5000/my-events/
// Routes
app.get("/", (req, res) => {
  res.send("Server is running");
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
