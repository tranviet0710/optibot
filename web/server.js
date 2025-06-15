const express = require("express");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const path = require("path");
const multer = require("multer");

// Load environment variables from .env file
dotenv.config();

const API_KEY = process.env.OPENAI_API_KEY;
const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

if (!API_KEY || !ASSISTANT_ID) {
  console.error(
    "Error: OPENAI_API_KEY and OPENAI_ASSISTANT_ID must be set in the .env file."
  );
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: API_KEY,
});

const app = express();
const port = 3000; // Node.js server will run on port 3000

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the current directory (web/)
app.use(express.static(__dirname));

// Endpoint to handle file uploads to OpenAI
app.post("/upload_file", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  try {
    const uploadedFile = await openai.files.create({
      file: req.file.buffer,
      purpose: "vision",
      fileName: req.file.originalname, // Preserve original filename
    });
    res.json({ file_id: uploadedFile.id });
  } catch (error) {
    console.error("Error uploading file to OpenAI:", error);
    res.status(500).json({ error: "Failed to upload file to OpenAI." });
  }
});

// Endpoint to handle chat messages
app.post("/chat", async (req, res) => {
  let threadId = req.body.thread_id;
  const userContent = req.body.content; // This will be an array of text/image_file objects

  if (!userContent || userContent.length === 0) {
    return res.status(400).json({ error: "No message content provided." });
  }

  try {
    // Create a new thread if one doesn't exist for the session
    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
    }

    // Add the user's message (with potential image) to the thread
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: userContent,
    });

    // Run the assistant on the thread
    let run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID,
    });

    // Poll the run status until completed
    while (run.status !== "completed") {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second
      run = await openai.beta.threads.runs.retrieve(threadId, run.id);
    }

    // Retrieve the messages and find the last assistant message
    const messages = await openai.beta.threads.messages.list(threadId, {
      order: "desc",
      limit: 1,
    });
    let assistantResponse = "";

    // Assuming the last message from the assistant will be a text message
    if (messages.data.length > 0 && messages.data[0].role === "assistant") {
      for (const contentBlock of messages.data[0].content) {
        if (contentBlock.type === "text") {
          assistantResponse = contentBlock.text.value;
          break;
        }
      }
    }

    res.json({ thread_id: threadId, message: assistantResponse });
  } catch (error) {
    console.error("Error in chat endpoint:", error);
    res.status(500).json({ error: "Failed to communicate with the chatbot." });
  }
});

// Serve index.html for the root path
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Start the server
app.listen(port, () => {
  console.log(`Node.js server listening at http://localhost:${port}`);
  console.log(
    "Please ensure your .env file in the 'web/' directory contains OPENAI_API_KEY and OPENAI_ASSISTANT_ID."
  );
});
