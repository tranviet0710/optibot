let thread_id = null;
let selectedFile = null;

const OPTIBOT_AVATAR =
  "https://optibot-assistant.optisigns.com/avatars/OptiBot";
const USER_AVATAR =
  "https://static.vecteezy.com/system/resources/thumbnails/009/734/564/small_2x/default-avatar-profile-icon-of-social-media-user-vector.jpg";

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
    selectedFile ? URL.createObjectURL(selectedFile) : null,
    true
  );

  // Hide suggested questions when a new message is sent
  document.getElementById("suggested-questions-container").style.display =
    "none";

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
      addMessage("Error uploading image. Please try again.", false, null, true);
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
      false,
      null,
      true
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

  addMessage(assistantMessage, false, null, true);

  // After assistant responds, fetch suggested questions
  fetchSuggestedQuestions();
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

  // Process content with nested bullet points or as question suggestions
  content.forEach((line) => {
    if (line.trim()) {
      // Check if the line contains multiple questions, separated by '?'
      const questions = line
        .split("?")
        .map((q) => q.trim())
        .filter((q) => q.length > 0);

      // If it looks like a list of questions, render each as a button
      if (
        questions.length > 1 ||
        (questions.length === 1 &&
          line.endsWith("?") &&
          !line.startsWith("- ") &&
          !line.startsWith("  - "))
      ) {
        formattedMessage += '<div class="assistant-suggestions-wrapper">';
        questions.forEach((q) => {
          formattedMessage += `
              <p>
                ${q}?
              </p>`;
        });
        formattedMessage += "</div>";
      } else if (line.startsWith("- ")) {
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

function addMessage(
  message,
  isUser = false,
  imageUrl = null,
  isNewMessage = false
) {
  const chatbox = document.getElementById("chatbox");
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${
    isUser ? "user-message" : "assistant-message"
  }`;

  const avatarImg = document.createElement("img");
  avatarImg.className = "avatar";
  avatarImg.src = isUser ? USER_AVATAR : OPTIBOT_AVATAR;
  avatarImg.alt = isUser ? "User Avatar" : "OptiBot Avatar";

  const messageContentWrapper = document.createElement("div");
  messageContentWrapper.className = "message-content-wrapper";

  let messageContentHTML = "";
  if (imageUrl) {
    messageContentHTML += `<img src="${imageUrl}" style="max-width: 100%; height: auto; border-radius: 8px; margin-bottom: 10px;">`;
  }

  if (isUser) {
    messageContentHTML += message;
  } else {
    messageContentHTML += formatAssistantMessage(message);
  }

  messageContentWrapper.innerHTML = messageContentHTML;

  // Append avatar and message content wrapper to the message div
  if (isUser) {
    messageDiv.appendChild(messageContentWrapper);
    messageDiv.appendChild(avatarImg);
  } else {
    messageDiv.appendChild(avatarImg);
    messageDiv.appendChild(messageContentWrapper);
  }

  chatbox.appendChild(messageDiv);
  chatbox.scrollTop = chatbox.scrollHeight;

  // Save to history ONLY if it's a new message
  if (isNewMessage) {
    chatHistory.push({ message: message, isUser: isUser, imageUrl: imageUrl });
    localStorage.setItem("optibot_chat_history", JSON.stringify(chatHistory));
  }
}

// Function to load chat history from localStorage
function loadChatHistory() {
  const storedHistory = JSON.parse(
    localStorage.getItem("optibot_chat_history")
  );
  if (storedHistory) {
    chatHistory = storedHistory; // Update the global chatHistory array
    document.getElementById("chatbox").innerHTML = ""; // Clear chatbox before loading
    chatHistory.forEach((item) => {
      addMessage(item.message, item.isUser, item.imageUrl, false); // Pass false for isNewMessage
    });
  }
}

// Function to fetch and display suggested questions
async function fetchSuggestedQuestions() {
  const suggestionsContainer = document.getElementById(
    "suggested-questions-container"
  );
  const suggestionsList = document.getElementById("suggestions-list");
  suggestionsList.innerHTML = ""; // Clear previous suggestions

  try {
    // Filter chat history to only include text messages for suggestion generation
    const historyForSuggestions = chatHistory
      .filter((item) => item.message && typeof item.message === "string")
      .map((item) => ({
        role: item.isUser ? "user" : "assistant",
        message: item.message,
      }));

    if (historyForSuggestions.length === 0) {
      suggestionsContainer.style.display = "none";
      return;
    }

    const response = await fetch("/suggest_questions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ history: historyForSuggestions }),
    });

    if (!response.ok) {
      console.error("Error fetching suggestions:", await response.text());
      suggestionsContainer.style.display = "none";
      return;
    }

    const data = await response.json();
    const suggestions = data.suggestions;

    if (suggestions && suggestions.length > 0) {
      suggestions.forEach((s) => {
        // Split each suggestion string by newline to handle multiple questions in one string
        const individualSuggestions = s
          .split(/\n|\?/g) // tách bằng \n hoặc ?
          .map((item) => item.trim())
          .filter((item) => item.length > 0);

        individualSuggestions.forEach((questionText) => {
          // Remove leading "- " if present
          let cleanQuestion = questionText.startsWith("- ")
            ? questionText.substring(2).trim()
            : questionText.trim();
          // Remove trailing '?' if present, to ensure it's added consistently later
          cleanQuestion = cleanQuestion.endsWith("?")
            ? cleanQuestion.slice(0, -1)
            : cleanQuestion;

          const button = document.createElement("button");
          button.className = "suggestion-button";
          // Add the '?' back for display and when sending
          button.textContent = cleanQuestion + "?";
          button.onclick = () => {
            document.getElementById("user-input").value = cleanQuestion + "?";
            sendMessage(); // Send the suggested question
          };
          suggestionsList.appendChild(button);
        });
      });
      suggestionsContainer.style.display = "flex";
    } else {
      suggestionsContainer.style.display = "none";
    }
  } catch (error) {
    console.error("Error in fetchSuggestedQuestions:", error);
    suggestionsContainer.style.display = "none";
  }
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

document
  .getElementById("image-upload")
  .addEventListener("change", function (event) {
    // ... existing image-upload listener ...
  });

function removeImage() {
  // ... existing removeImage function ...
}

// Theme switching logic
const themeToggle = document.getElementById("theme-toggle");

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  themeToggle.checked = theme === "dark";
}

// Load saved theme on page load
document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme") || "light"; // Default to light
  setTheme(savedTheme);
});

// Event listener for theme toggle
themeToggle.addEventListener("change", (event) => {
  if (event.target.checked) {
    setTheme("dark");
  } else {
    setTheme("light");
  }
});
