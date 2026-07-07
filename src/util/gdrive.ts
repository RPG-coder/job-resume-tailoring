import { Job } from "../interfaces/global";

/**
 * Safely searches for a Google Drive folder without creating it.
 * Used for read-only operations like fetching metadata on page load.
 * * @param {string} token - The active Google OAuth access token.
 * @param {string} folderName - The target folder name to find.
 * @param {string} [parentId] - Optional ID of a parent folder.
 * @returns {Promise<string | null>} - The Folder ID, or null if it doesn't exist.
 */
export async function findFolder(
  token: string,
  folderName: string,
  parentId?: string,
): Promise<string | null> {
  let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;

  try {
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!searchRes.ok) return null;

    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }
  } catch (error) {
    console.warn(`[Drive API] Search failed for folder: ${folderName}`);
  }

  return null;
}

/**
 * Extracts a clean company name from a URL to use as a Google Drive folder name.
 * Strips common job board subdomains to group jobs from the same company together.
 * * @param {string} url - The full URL of the job posting.
 * @returns {string} - The cleaned root domain name (e.g., "google", "openai").
 */
export function getDomainFolderName(url: string): string {
  try {
    // 1. Parse the raw string into a native URL object to isolate the hostname
    const hostname = new URL(url).hostname;

    // 2. Strip away common prefixes used by applicant tracking systems and websites
    const cleanHost = hostname.replace(
      /^(www\.|jobs\.|careers\.|boards\.|app\.|jobs\.)/i,
      "",
    );

    // 3. Split by the dot and take the first part (e.g., "openai" from "openai.com")
    return cleanHost.split(".")[0] || "Unknown Company";
  } catch (error) {
    // Fallback if the parser fails on a malformed local URL
    return "Unknown Company";
  }
}

/**
 * Dynamically finds an existing Google Drive folder or creates a new one.
 * Includes explicit error handling for stale tokens or API rejections.
 * * @param {string} token - The active Google OAuth access token.
 * @param {string} folderName - The target folder name to find or create.
 * @param {string} [parentId] - Optional ID of a parent folder to nest inside.
 * @returns {Promise<string>} - The Google Drive Folder ID.
 */
export async function getOrCreateFolder(
  token: string,
  folderName: string,
  parentId?: string,
): Promise<string> {
  // 🚨 DEBUG: Let's see EXACTLY what the token variable holds
  console.log(`[Drive API] Attempting to find/create folder: "${folderName}"`);
  console.log(`[Drive API] Token Value:`, token);
  console.log(`[Drive API] Token Length:`, token ? token.length : "NO TOKEN");

  if (!token || token === "undefined") {
    throw new Error(
      `FATAL: The Drive utility was passed an empty or invalid token!`,
    );
  }

  let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;

  const searchRes = await fetch(searchUrl, {
    // 🚨 DEBUG: Ensure the Bearer string is constructed properly
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!searchRes.ok) {
    const err = await searchRes.json();
    throw new Error(
      `Drive Search Error: ${err.error?.message || searchRes.statusText}`,
    );
  }

  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    console.log(
      `[Drive API] Found existing folder "${folderName}" with ID: ${searchData.files[0].id}`,
    );
    return searchData.files[0].id;
  }

  const metadata: any = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };

  if (parentId) {
    metadata.parents = [parentId];
  }

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!createRes.ok) {
    const err = await createRes.json();
    throw new Error(
      `Drive Create Error: ${err.error?.message || createRes.statusText}`,
    );
  }

  const createData = await createRes.json();

  if (!createData.id) {
    throw new Error(
      `Failed to retrieve ID for newly created folder: ${folderName}`,
    );
  }

  console.log(
    `[Drive API] Created new folder "${folderName}" with ID: ${createData.id}`,
  );
  return createData.id;
}

/**
 * Orchestrates folder creation and uploads the cleaned job text to Google Drive.
 * Uses a multipart request to send metadata (filename/location) and content simultaneously.
 * * @param {Object} jobData - The job title, url, and plain text body.
 * @param {string} token - The active Google OAuth access token.
 * @returns {Promise<any>} - The Drive API response containing the new file ID.
 */
export async function uploadFileToDrive(
  jobData: { title: string; url: string; cleanText: string },
  token: string,
) {
  // 1. Sanitize the job title so it makes a safe filename
  const safeTitle = jobData.title
    .replace(/[^a-zA-Z0-9 -]/g, "")
    .substring(0, 100);

  // 2. Resolve the folder structure
  const companyName = getDomainFolderName(jobData.url);
  const rootFolderId = await getOrCreateFolder(token, "Job Assistant");
  const companyFolderId = await getOrCreateFolder(
    token,
    companyName,
    rootFolderId,
  );

  console.log(
    `📁 Target Company Folder ID (${companyName}): ${companyFolderId}`,
  );

  // 3. Setup metadata for a standard .txt file
  const metadata = {
    name: `[Job] ${safeTitle}.txt`,
    mimeType: "text/plain",
    parents: [companyFolderId],
  };

  // 4. Construct the multipart request body
  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  // Add the URL to the top of the text document for easy reference
  const fileContent = `Source URL: ${jobData.url}\n\n${jobData.cleanText}`;

  const multipartRequestBody =
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: text/plain\r\n\r\n" +
    fileContent +
    close_delim;

  // 5. Fire the upload request to Google Drive
  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,parents",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    },
  );

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(
      `File Upload Error: ${errData.error?.message || response.statusText}`,
    );
  }

  return response.json();
}

/**
 * Synchronizes the array of Jobs to a metadata.json file in the domain's Google Drive folder.
 * Automatically handles creating the file if it doesn't exist, or overwriting it if it does.
 *
 * @param {string} domain - The company domain name (e.g., "openai").
 * @param {Job[]} jobs - The current array of saved jobs for this domain.
 * @param {string} token - The active Google OAuth access token.
 * @returns {Promise<void>}
 */
export async function syncMetadataToDrive(
  domain: string,
  jobs: Job[],
  token: string,
): Promise<void> {
  // 1. Resolve folder hierarchy
  const rootFolderId = await getOrCreateFolder(token, "Job Assistant");
  const domainFolderId = await getOrCreateFolder(token, domain, rootFolderId);

  const domainSpecificJobs = jobs.filter((j) => j.company === domain);

  // 2. Search for existing metadata.json
  const query = `name='metadata.json' and '${domainFolderId}' in parents and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!searchRes.ok) throw new Error(`Search failed: ${searchRes.statusText}`);
  const searchData = await searchRes.json();
  const fileContent = JSON.stringify(domainSpecificJobs, null, 2);

  if (searchData.files && searchData.files.length > 0) {
    // 3A. PATCH Update
    const fileId = searchData.files[0].id;
    const patchRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: fileContent,
      },
    );
    // 🚨 ADDED ERROR CHECKING
    if (!patchRes.ok) {
      const errorData = await patchRes.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || `PATCH failed: ${patchRes.statusText}`,
      );
    }
  } else {
    // 3B. POST Create
    const boundary = "-------314159265358979323846";
    const delimiter = "\r\n--" + boundary + "\r\n";
    const closeDelim = "\r\n--" + boundary + "--";

    const multipartBody =
      delimiter +
      "Content-Type: application/json\r\n\r\n" +
      JSON.stringify({
        name: "metadata.json",
        mimeType: "application/json",
        parents: [domainFolderId],
      }) +
      delimiter +
      "Content-Type: application/json\r\n\r\n" +
      fileContent +
      closeDelim;

    const postRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      },
    );
    if (!postRes.ok) {
      const errorData = await postRes.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || `POST failed: ${postRes.statusText}`,
      );
    }
  }
}

/**
 * Fetches the metadata.json file from the domain's Google Drive folder.
 * Now strictly read-only: will NOT create folders if they are missing.
 * * @param {string} domain - The company domain name.
 * @param {string} token - The active Google OAuth access token.
 * @returns {Promise<Job[] | null>} - The array of jobs, or null if no file exists yet.
 */
export async function fetchMetadataFromDrive(
  domain: string,
  token: string,
): Promise<Job[] | null> {
  // 1. Check if the root folder exists (DO NOT CREATE)
  const rootFolderId = await findFolder(token, "Job Assistant");
  if (!rootFolderId) return null; // No root folder means no jobs saved yet

  // 2. Check if the domain folder exists (DO NOT CREATE)
  const domainFolderId = await findFolder(token, domain, rootFolderId);
  if (!domainFolderId) return null; // No domain folder means no jobs for this company

  // 3. Search for metadata.json inside the domain folder
  const query = `name='metadata.json' and '${domainFolderId}' in parents and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const searchData = await searchRes.json();

  if (!searchData.files || searchData.files.length === 0) {
    return null;
  }

  // 4. Download the file contents
  const fileId = searchData.files[0].id;
  const downloadRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!downloadRes.ok) throw new Error("Failed to download metadata.json");
  return await downloadRes.json();
}

/**
 * Aggregates all job descriptions across every company subfolder.
 * Maps to the "Combined all metadata.json" step in your architecture.
 * * @param {string} token - The active Google OAuth access token.
 * @returns {Promise<Job[]>} - A unified array containing all saved jobs.
 */
export async function aggregateAllMetadata(token: string): Promise<Job[]> {
  // 1. Locate the master root folder
  const rootFolderId = await findFolder(token, "Job Assistant");
  if (!rootFolderId) return [];

  // 2. Retrieve all child folders (company domains) inside the root
  const subfoldersUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  )}&fields=files(id,name)`;

  const subfoldersRes = await fetch(subfoldersUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!subfoldersRes.ok)
    throw new Error("Failed to retrieve company directories.");
  const subfoldersData = await subfoldersRes.json();

  const allJobs: Job[] = [];

  // 3. Concurrently scan every company folder for its metadata.json file
  await Promise.all(
    subfoldersData.files.map(async (folder: { id: string; name: string }) => {
      try {
        const fileUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          `name='metadata.json' and '${folder.id}' in parents and trashed=false`,
        )}&fields=files(id)`;

        const fileRes = await fetch(fileUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const fileData = await fileRes.json();

        if (fileData.files && fileData.files.length > 0) {
          const fileId = fileData.files[0].id;

          // Download the file content
          const downloadRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            { headers: { Authorization: `Bearer ${token}` } },
          );

          if (downloadRes.ok) {
            const companyJobs: Job[] = await downloadRes.json();
            // Inject company provenance if missing from local entry
            companyJobs.forEach((job) => {
              if (!job.company) job.company = folder.name;
            });
            allJobs.push(...companyJobs);
          }
        }
      } catch (err) {
        console.warn(`Skipping path "${folder.name}" due to read error:`, err);
      }
    }),
  );

  return allJobs;
}

/**
 * Uploads or updates the Master Document file directly in the root "Job Assistant" folder.
 * * @param {string} token - Google OAuth Token
 * @param {string} textContent - The plain text contents of the document
 */
export async function uploadMasterDocumentToDrive(
  token: string,
  textContent: string,
): Promise<void> {
  const rootFolderId = await getOrCreateFolder(token, "Job Assistant");

  // 1. Check if masterdocument.txt already exists
  const query = `name='masterdocument.txt' and '${rootFolderId}' in parents and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!searchRes.ok)
    throw new Error("Failed to check for existing Master Document.");
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    // 2A. Update existing file (PATCH)
    const fileId = searchData.files[0].id;
    const patchRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "text/plain",
        },
        body: textContent,
      },
    );
    if (!patchRes.ok)
      throw new Error("Failed to update Master Document on Drive.");
    console.log("✏️ Master Document successfully overwritten on Drive.");
  } else {
    // 2B. Create new file (Multipart POST)
    const boundary = "-------314159265358979323846";
    const delimiter = "\r\n--" + boundary + "\r\n";
    const closeDelim = "\r\n--" + boundary + "--";

    const multipartBody =
      delimiter +
      "Content-Type: application/json\r\n\r\n" +
      JSON.stringify({
        name: "masterdocument.txt",
        mimeType: "text/plain",
        parents: [rootFolderId],
      }) +
      delimiter +
      "Content-Type: text/plain\r\n\r\n" +
      textContent +
      closeDelim;

    const postRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      },
    );
    if (!postRes.ok)
      throw new Error("Failed to write new Master Document to Drive.");
    console.log("💾 Master Document successfully created on Drive.");
  }
}
