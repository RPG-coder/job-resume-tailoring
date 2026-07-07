import { pipeline, env } from "@xenova/transformers";
import { Job } from "../interfaces/global";

// Disable local model paths since we are fetching the ONNX model directly from the HuggingFace Hub
// It will be cached in the browser's Cache API automatically after the first download.
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.proxy = false; // Prevents spawning Workers
env.backends.onnx.wasm.numThreads = 1; // Forces single-threading

/**
 * Singleton class to ensure we only load the machine learning model into memory once.
 */
class EmbeddingPipeline {
  static task = "feature-extraction" as const;
  static model = "Xenova/all-MiniLM-L6-v2";
  static instance: any = null;

  static async getInstance(progressCallback?: Function) {
    if (this.instance === null) {
      // 2. We bypass the worker by setting the model loading options
      this.instance = pipeline(this.task, this.model, {
        progress_callback: progressCallback,
        // Ensure we don't try to use WebGPU or multi-threaded WASM
        config: {
          use_external_data_format: true,
        },
      });
    }
    return this.instance;
  }
}

/**
 * Converts a string of text into a vector embedding array.
 *
 * @param {string} text - The clean text to embed.
 * @param {Function} [onProgress] - Optional callback to hook into the UI to show download progress.
 * @returns {Promise<number[]>} - The 384-dimensional vector array.
 */
export async function generateEmbedding(
  text: string,
  onProgress?: Function,
): Promise<number[]> {
  try {
    const extractor = await EmbeddingPipeline.getInstance(onProgress);
    // 3. Inference
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
  } catch (error) {
    console.error("Embedding generation failed:", error);
    throw new Error("Embedding generation failed.");
  }
}

/**
 * Calculates the Cosine Similarity between two vector embeddings.
 * Used to find the most contextually relevant job description for the RAG pipeline.
 * * @param {number[]} vecA - The first vector array.
 * @param {number[]} vecB - The second vector array.
 * @returns {number} - A score between -1 and 1 representing semantic similarity.
 */
export function calculateCosineSimilarity(
  vecA: number[],
  vecB: number[],
): number {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must be the same length to calculate similarity.");
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Processes global vector matching to isolate the optimal unvisited job match.
 * Matches the right-hand execution pipeline of your architecture diagram.
 * * @param {number[]} masterVector - The vector embedding of your Master Document.
 * @param {Job[]} aggregatedJobs - The combined collection from all metadata.json files.
 * @param {string[]} visitedUrls - Array of job URLs you have already processed/visited.
 * @returns {Job | null} - The highest scoring unvisited match, or null.
 */
export function getClosestUnvisitedMatch(
  masterVector: number[],
  aggregatedJobs: Job[],
  visitedUrls: string[],
): Job | null {
  let bestMatch: Job | null = null;
  let highestScore = -1;

  // Filter out visited jobs to enforce the "Unvisited" constraint
  const unvisitedJobs = aggregatedJobs.filter(
    (job) => !visitedUrls.includes(job.url),
  );

  unvisitedJobs.forEach((job) => {
    if (!job.embedding) return;

    // Compute comparison metric against master vector
    const similarityScore = calculateCosineSimilarity(
      masterVector,
      job.embedding,
    );

    if (similarityScore > highestScore) {
      highestScore = similarityScore;
      bestMatch = job;
    }
  });

  console.log(`🎯 Optimal vector match found with score: ${highestScore}`);
  return bestMatch;
}

/**
 * Compares all aggregated jobs against the Master Vector and sorts them by relevance.
 * @param {number[]} masterVector - The 384-dimensional vector of your resume.
 * @param {Job[]} aggregatedJobs - The combined jobs from all company folders.
 * @returns {Array} - The jobs array, now including a `score` property, sorted highest to lowest.
 */
export function rankJobsAgainstMaster(
  masterVector: number[],
  aggregatedJobs: Job[],
): (Job & { score: number })[] {
  return aggregatedJobs
    .map((job) => {
      const score = job.embedding
        ? calculateCosineSimilarity(masterVector, job.embedding)
        : 0;
      return { ...job, score };
    })
    .sort((a, b) => b.score - a.score); // Sort highest score first
}
