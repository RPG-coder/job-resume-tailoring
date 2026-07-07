import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

export async function generateContent(prompt: string) {
  // Use 'gemini-1.5-flash' for high speed and RAG efficiency
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}
