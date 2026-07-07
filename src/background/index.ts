import { uploadFileToDrive } from "../util/gdrive";
import { Job } from "../interfaces/global";

/**
 * INSTALLATION EVENT:
 * Configure the extension to open the Sidepanel automatically.
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log("Job Assistant Installed & Background Worker Running");
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(console.error);
});

/**
 * MESSAGE ROUTER & AUTH PROVIDER
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "GET_AUTH_TOKEN") {
    console.log("Background: Received token request from Sidepanel...");

    try {
      chrome.identity.getAuthToken(
        { interactive: true },
        function (authResult: any) {
          // 1. Catch Google-specific configuration errors
          if (chrome.runtime.lastError) {
            console.error(
              "Background Auth Error:",
              chrome.runtime.lastError.message,
            );
            sendResponse({
              status: "error",
              error:
                chrome.runtime.lastError.message ||
                "Unknown OAuth error. Check manifest.json.",
            });
            return;
          }

          const token =
            typeof authResult === "string" ? authResult : authResult?.token;

          // 2. Catch empty token errors
          if (!token) {
            console.error("Background Auth Error: Token returned empty.");
            sendResponse({
              status: "error",
              error: "Google returned an empty token.",
            });
            return;
          }

          // 3. Success
          console.log("Background: Token successfully generated!");
          sendResponse({ status: "success", token: token });
        },
      );
    } catch (err: any) {
      // 4. Catch unexpected crashes (this prevents the "port closed" error)
      console.error("Background Hard Crash:", err);
      sendResponse({ status: "error", error: err.message });
    }

    return true; // CRITICAL: This tells Chrome to keep the port open for the async response!
  }

  if (message.action === "SAVE_JOB_TO_DRIVE") {
    if (sender.tab?.windowId) {
      chrome.sidePanel
        .open({ windowId: sender.tab.windowId })
        .then(() => {
          chrome.runtime.sendMessage({
            action: "PROCESS_NEW_JOB",
            payload: message.payload,
          });
          sendResponse({ status: "success", message: "Sent to Sidepanel." });
        })
        .catch((err) => {
          sendResponse({ status: "error", error: err.message });
        });
    }
    return true;
  }
});
