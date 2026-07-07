/**
 * Cleans raw HTML strings into readable, block-delimited plain text.
 * Strips non-content markup and injects structural newlines to prevent text clumping.
 * * @param {string} htmlString - The raw HTML string fetched from the webpage DOM.
 * @returns {string} - Pristine plain text with preserved line breaks.
 */
export function convertHtmlToPlainText(htmlString: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");

  // 1. Permanently remove elements that contain no user-facing job text
  const noisyElements = doc.querySelectorAll(
    'script, style, nav, footer, header, noscript, iframe, svg, form, [role="banner"], [role="navigation"]',
  );
  noisyElements.forEach((el) => el.remove());

  // 2. Inject explicit newlines onto block level elements before reading content
  doc.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  doc
    .querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, tr")
    .forEach((block) => {
      block.appendChild(doc.createTextNode("\n"));
    });

  // 3. Target standard job description containers if they exist; otherwise fallback to body
  const mainContent = doc.querySelector(
    "main, article, #job-description, .job-description, .description",
  );

  let rawText = "";
  if (mainContent) {
    rawText = mainContent.textContent ?? "";
  } else {
    rawText = doc.body.textContent ?? "";
  }

  // 4. Sanitize whitespaces: compress multiple tabs/spaces, fix multiple empty lines, and trim edges
  return rawText
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
}

/**
 * Streamlined scraper: Extracts page source, immediately cleans it,
 * and sends the lightweight text to the background for Drive upload.
 */
export const scrapeJobToDrive = () => {
  // 1. Gather page metadata and raw source code
  const url = window.location.href;
  const title = document.title;
  const rawHtml = document.documentElement.outerHTML;

  // 2. Direct Pipeline: Convert HTML to Clean Text immediately (Bypassing local storage)
  const cleanText = convertHtmlToPlainText(rawHtml);
  const jobData = { title, url, cleanText };

  // 3. Update the UI to show progress
  const btn = document.getElementById("job-assistant-save-btn");
  if (btn) btn.innerText = "Saving to Drive... ⏳";

  // 4. Send payload to Background Script
  try {
    chrome.runtime.sendMessage(
      { action: "SAVE_JOB_TO_DRIVE", payload: jobData },
      (response: { status: string; error?: string } | undefined) => {
        // Handle "Extension context invalidated" silently
        if (chrome.runtime.lastError) {
          console.warn("Chrome connection lost. Please refresh the page.");
          alert("Extension updated! Please refresh the page and try again.");
          if (btn) btn.innerText = "Add Page to Job Interest";
          return;
        }

        // Reset UI and notify user of result
        if (btn) btn.innerText = "Add Page to Job Interest";
        if (response?.status === "success") {
          alert("Success! Clean text saved directly to Google Drive.");
        } else {
          alert("Failed to save: " + (response?.error || "Unknown error"));
        }
      },
    );
  } catch (error) {
    // Catch fatal context invalidations
    console.error("Context Invalidated:", error);
    alert("Extension context was invalidated. Please refresh this webpage!");
  }
};
