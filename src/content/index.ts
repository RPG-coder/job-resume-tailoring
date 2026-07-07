import { scrapeJobToDrive } from "./scrape";

/**
 * Injects a fixed floating button into the webpage's DOM.
 * Prevents duplicates and attaches the scraper click handler.
 */
export const injectActionButton = () => {
  // 1. Prevent duplicate buttons if the script runs multiple times
  if (document.getElementById("job-assistant-save-btn")) return;

  // 2. Create the button element
  const button = document.createElement("button");
  button.id = "job-assistant-save-btn";
  button.innerText = "Add Page to Job Interest";

  // 3. Apply modern, isolated CSS styles directly via JavaScript
  // Using fixed positioning so it stays anchored to the viewport
  Object.assign(button.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: "999999", // Ensure it floats on top of all website elements
    padding: "12px 24px",
    backgroundColor: "#1a73e8", // Professional Chrome Blue
    color: "#ffffff",
    border: "none",
    borderRadius: "24px", // Rounded capsule shape
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "14px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    transition: "transform 0.2s ease, background-color 0.2s ease",
  });

  // 4. Add subtle hover micro-interactions
  button.addEventListener("mouseenter", () => {
    button.style.backgroundColor = "#1557b0";
    button.style.transform = "scale(1.03)";
  });
  button.addEventListener("mouseleave", () => {
    button.style.backgroundColor = "#1a73e8";
    button.style.transform = "scale(1)";
  });

  // 5. Wire the click event directly to our Scraper function
  button.addEventListener("click", scrapeJobToDrive);

  // 6. Append the finished element to the page body
  document.body.appendChild(button);
};

// --- INITIALIZATION LISTENERS & ACTIONS ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "TRIGGER_SAVE_FROM_PANEL") {
    console.log("Scrape command received from Extension Sidepanel.");
    scrapeJobToDrive();
    sendResponse({ status: "initiated" });
  }
  return false;
});

// Run injector instantly
injectActionButton();
