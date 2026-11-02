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

// Routes
app.get("/", (req, res) => {
  res.send("Server is running");
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
