let thread_id = null;
let selectedFile = null;

// Load thread_id from localStorage if available
window.onload = function () {
  thread_id = localStorage.getItem("optibot_thread_id");
  initSpeechRecognition();
  loadChatHistory(); // Load chat history when the page loads
};

async function sendMessage() {
  const input = document.getElementById("user-input");
  const messageText = input.value;
  input.value = "";

  // Add user message to display and save, with image preview if applicable
  addMessage(
    messageText,
    true,
    selectedFile ? URL.createObjectURL(selectedFile) : null
  );

  // Show loading indicator
  document.getElementById("loading-indicator").style.display = "flex";

  let contentArray = [];
  if (messageText) {
    contentArray.push({ type: "text", text: messageText });
  }

  let file_id = null;
  if (selectedFile) {
    const formData = new FormData();
    formData.append("file", selectedFile);

    const uploadResp = await fetch("/upload_file", {
      // Call Node.js backend for file upload
      method: "POST",
      body: formData,
    });

    if (!uploadResp.ok) {
      console.error("Error uploading file:", await uploadResp.text());
      addMessage("Error uploading image. Please try again.", false); // Display error to user
      document.getElementById("loading-indicator").style.display = "none";
      removeImage();
      return;
    }

    const uploadData = await uploadResp.json();
    file_id = uploadData.file_id;
    contentArray.push({
      type: "image_file",
      image_file: {
        file_id: file_id,
      },
    });
    removeImage(); // Clear selected image after successful upload
  }

  if (contentArray.length === 0) {
    document.getElementById("loading-indicator").style.display = "none";
    return;
  }

  // Send message to backend endpoint
  const chatResp = await fetch("/chat", {
    // Call Node.js backend for chat
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      thread_id: thread_id,
      content: contentArray,
    }),
  });

  if (!chatResp.ok) {
    console.error("Error from backend:", await chatResp.text());
    addMessage(
      "Error communicating with the chatbot. Please try again.",
      false
    );
    document.getElementById("loading-indicator").style.display = "none";
    return;
  }

  const chatData = await chatResp.json();
  thread_id = chatData.thread_id; // Update thread_id from backend
  localStorage.setItem("optibot_thread_id", thread_id); // Save thread_id to localStorage

  const assistantMessage = chatData.message; // Get message from backend

  // Hide loading indicator before displaying the message
  document.getElementById("loading-indicator").style.display = "none";

  addMessage(assistantMessage, false); // Add assistant message to display and save
}

// Function to format the assistant's message
function formatAssistantMessage(message) {
  // Split the message into content and article URLs
  const parts = message.split("\n");
  const content = [];
  const articleUrls = [];

  parts.forEach((part) => {
    if (part.startsWith("Article URL:")) {
      // Extract the URL from the format: Article URL: https://example.com/article【file.txt】
      const urlMatch = part.match(/Article URL: (https?:\/\/[^\s【]+)/);
      if (urlMatch) {
        articleUrls.push({
          label: "Article URL",
          link: urlMatch[1],
        });
      }
    } else if (part.trim()) {
      content.push(part);
    }
  });

  // Create the formatted message
  let formattedMessage = '<div class="message-content">';

  // Process content with nested bullet points
  content.forEach((line) => {
    if (line.trim()) {
      if (line.startsWith("- ")) {
        // Main bullet point
        formattedMessage += `<div class="bullet-point">${line.substring(
          2
        )}</div>`;
      } else if (line.startsWith("  - ")) {
        // Nested bullet point
        formattedMessage += `<div class="nested-bullet-point">${line.substring(
          4
        )}</div>`;
      } else {
        // Regular text
        formattedMessage += `<div class="message-text">${line}</div>`;
      }
    }
  });

  formattedMessage += "</div>";

  // Add article URLs if any
  if (articleUrls.length > 0) {
    formattedMessage += '<div class="article-url">';
    articleUrls.forEach(({ label, link }) => {
      formattedMessage += `
        <div class="article-link">
          <i class="fas fa-external-link-alt"></i>
          <span>${label}:</span>
          <a href="${link}" target="_blank">${link}</a>
        </div>`;
    });
    formattedMessage += "</div>";
  }

  return formattedMessage;
}

// Function to add a message to the chat and save to history
let chatHistory =
  JSON.parse(localStorage.getItem("optibot_chat_history")) || [];

function addMessage(message, isUser = false, imageUrl = null) {
  const chatbox = document.getElementById("chatbox");
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${
    isUser ? "user-message" : "assistant-message"
  }`;

  let messageContent = "";
  if (imageUrl) {
    messageContent += `<img src="${imageUrl}" style="max-width: 100%; height: auto; border-radius: 8px; margin-bottom: 10px;">`;
  }

  if (isUser) {
    messageContent += message;
  } else {
    messageContent += formatAssistantMessage(message);
  }

  messageDiv.innerHTML = messageContent;

  chatbox.appendChild(messageDiv);
  chatbox.scrollTop = chatbox.scrollHeight;

  // Save to history
  chatHistory.push({ message: message, isUser: isUser, imageUrl: imageUrl });
  localStorage.setItem("optibot_chat_history", JSON.stringify(chatHistory));
}

// Function to load chat history from localStorage
function loadChatHistory() {
  chatHistory.forEach((item) => {
    addMessage(item.message, item.isUser, item.imageUrl);
  });
}

// Speech recognition variables and functions
let recognition = null;
let isRecording = false;

function initSpeechRecognition() {
  if ("webkitSpeechRecognition" in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US"; // Set to English

    recognition.onstart = function () {
      isRecording = true;
      document.getElementById("micButton").classList.add("recording");
      document.getElementById("statusIndicator").textContent = "Listening...";
    };

    recognition.onend = function () {
      isRecording = false;
      document.getElementById("micButton").classList.remove("recording");
      document.getElementById("statusIndicator").textContent = "";
    };

    recognition.onresult = function (event) {
      const transcript = event.results[0][0].transcript;
      document.getElementById("user-input").value = transcript;
      sendMessage();
    };

    recognition.onerror = function (event) {
      console.error("Speech recognition error:", event.error);
      document.getElementById("statusIndicator").textContent =
        "Error: " + event.error;
      isRecording = false;
      document.getElementById("micButton").classList.remove("recording");
    };
  } else {
    console.error("Speech recognition not supported");
    document.getElementById("micButton").style.display = "none";
  }
}

function toggleRecording() {
  if (!recognition) {
    initSpeechRecognition();
  }

  if (isRecording) {
    recognition.stop();
  } else {
    recognition.start();
  }
}
