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

// Serve static files from the 'public' directory within the current directory (web/public/)
app.use(express.static(path.join(__dirname, "public")));

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

// New endpoint for autocompletion suggestions
app.post("/autocomplete_question", async (req, res) => {
  const { input_prefix } = req.body;

  if (!input_prefix) {
    return res.status(400).json({ error: "Input prefix is required." });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // Or 'gpt-4' for better quality
      messages: [
        {
          role: "system",
          content:
            "You are an AI assistant for OptiSigns support. Your goal is to help users quickly formulate questions relevant to OptiSigns products, features, or troubleshooting. Provide concise, relevant question completions based on common OptiSigns inquiries and topics found in a knowledge base. Complete the user's sentence without extra conversational text, numbering, or greetings. Provide up to 5 diverse and helpful completions as a comma-separated list.",
        },
        {
          role: "user",
          content: `Complete the following question: "${input_prefix}`,
        },
      ],
      temperature: 0.5, // Lower temperature for more focused completions
      max_tokens: 50, // Max tokens for completion length
    });

    const completionsText = completion.choices[0].message.content;
    const completions = completionsText
      .split(/[\n\?]/)
      .map(
        (s) =>
          s
            .trim()
            .replace(/^["',\s\\]+/, "") // remove leading ", \ or whitespace
            .replace(/["',\s\\]+$/, "") // remove trailing ", \ or whitespace
            .replace(/^\d+\.\s*/, "") // remove leading numbering like 1.
      )
      .filter((s) => s.length > 0);

    res.json({ completions: completions });
  } catch (error) {
    console.error("Error generating autocompletions:", error);
    res.status(500).json({ error: "Failed to generate autocompletions." });
  }
});

// New endpoint to suggest questions
app.post("/suggest_questions", async (req, res) => {
  const chatHistory = req.body.history; // Array of {role: 'user'|'assistant', content: 'text'} objects

  if (!chatHistory || chatHistory.length === 0) {
    return res
      .status(400)
      .json({ error: "Chat history is required for suggestions." });
  }

  // Create a simple prompt for suggested questions based on history
  const messages = chatHistory.map((msg) => ({
    role: msg.isUser ? "user" : "assistant",
    content: msg.message,
  }));

  messages.push({
    role: "user",
    content:
      "Based on the conversation so far, suggest 3 concise, relevant follow-up questions for the user to ask. Provide them as a comma-separated list without numbering or extra text.", // Prompt to get concise suggestions
  });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // Or "gpt-4" for better quality
      messages: messages,
      temperature: 0.7,
      max_tokens: 100,
    });

    const suggestionsText = completion.choices[0].message.content;
    // Parse suggestions from comma-separated string to array
    const suggestions = suggestionsText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    res.json({ suggestions: suggestions });
  } catch (error) {
    console.error("Error generating suggestions:", error);
    res.status(500).json({ error: "Failed to generate suggestions." });
  }
});

// Serve index.html for the root path from the 'public' directory
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start the server
app.listen(port, () => {
  console.log(`Node.js server listening at http://localhost:${port}`);
});
