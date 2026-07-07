/**
 * Cleans raw HTML strings into readable, block-delimited plain text.
 * Strips non-content markup and injects structural newlines to prevent text clumping.
 * * @param {string} htmlString - The raw HTML string fetched from the webpage DOM.
 * @returns {string} - Pristine plain text with preserved line breaks.
 */
export function convertHtmlToPlainText(htmlString: string): string {
  // Initialize the native browser DOM parser
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");

  // 1. Permanently remove elements that contain no user-facing job text
  const noisyElements = doc.querySelectorAll(
    'script, style, nav, footer, header, noscript, iframe, svg, form, [role="banner"], [role="navigation"]',
  );
  noisyElements.forEach((el) => el.remove());

  // 2. Inject explicit newlines onto block level elements before reading content
  // This ensures text in adjacent <div> or <p> nodes doesn't mash together into one line
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
    .replace(/[ \t]+/g, " ") // Compress spaces and tabs
    .replace(/\n\s*\n/g, "\n\n") // Condense multiple blank lines into double newlines
    .trim(); // Trim trailing whitespace
}
