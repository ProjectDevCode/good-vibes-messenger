import type { Handler } from "@netlify/functions";
import { GoogleGenAI, Type } from "@google/genai";
import { MessageType, MessageTheme, ImageStyle } from "../../../types";

// Initialize the Google Gemini API client
// The API key must be set in the environment variables of your Netlify project
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates message suggestions using the Gemini API.
 * @param payload - The payload containing message type and theme.
 * @returns A promise that resolves to an array of string suggestions.
 */
async function handleGetSuggestions(payload: {
  messageType: MessageType;
  theme: MessageTheme;
}) {
  const { messageType, theme } = payload;
  // Use gemini-2.5-flash for basic text tasks.
  const model = "gemini-2.5-flash"; 

  const prompt = `Gere 3 sugestões de mensagens curtas e inspiradoras de "${messageType}" com o tema "${theme}". As mensagens devem ser adequadas para enviar no WhatsApp. Formato da resposta deve ser um array JSON de strings. Por exemplo: ["mensagem 1", "mensagem 2", "mensagem 3"]`;

  // Use ai.models.generateContent to generate text, and configure for JSON output.
  const response = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.STRING,
          description: "Uma sugestão de mensagem.",
        },
      },
    },
  });

  // Extract text from response using the .text property.
  const text = response.text.trim();
  try {
    const suggestions = JSON.parse(text);
    if (!Array.isArray(suggestions)) {
        throw new Error("A resposta da IA não é um array.");
    }
    return suggestions;
  } catch (e) {
    console.error("Falha ao analisar a resposta de sugestões do Gemini:", text, e);
    throw new Error(
      "A resposta da IA para sugestões não estava no formato JSON esperado."
    );
  }
}

/**
 * Generates an image using the Gemini API.
 * @param payload - The payload containing the message, image style, and message type.
 * @returns A promise that resolves to an object with the base64 data URL of the image.
 */
async function handleGenerateImage(payload: {
  message: string;
  imageStyle: ImageStyle;
  messageType: MessageType;
}) {
  const { message, imageStyle, messageType } = payload;
  // Use imagen-4.0-generate-001 for high-quality image generation.
  const model = "imagen-4.0-generate-001";

  const prompt = `Crie uma imagem no estilo "${imageStyle}" que represente visualmente a seguinte mensagem de "${messageType}": "${message}". A imagem deve ser bonita, inspiradora e adequada para compartilhar em redes sociais como o WhatsApp. Não inclua nenhum texto na imagem.`;

  // Use ai.models.generateImages for image generation.
  const imageResponse = await ai.models.generateImages({
    model,
    prompt,
    config: {
      numberOfImages: 1,
      outputMimeType: 'image/png',
      aspectRatio: '1:1', // Square image is good for sharing
    },
  });

  if (imageResponse.generatedImages && imageResponse.generatedImages.length > 0) {
    const base64ImageBytes = imageResponse.generatedImages[0].image.imageBytes;
    const imageUrl = `data:image/png;base64,${base64ImageBytes}`;
    return { imageUrl };
  } else {
    throw new Error("Nenhuma imagem foi gerada pela IA.");
  }
}

/**
 * Netlify Serverless Function handler.
 * Acts as a proxy to the Google Gemini API.
 */
const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { Allow: "POST" },
      body: JSON.stringify({ error: "Método não permitido" }),
    };
  }

  try {
    const { action, payload } = JSON.parse(event.body || "{}");

    if (!action || !payload) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Ação ou payload ausente na requisição" }),
      };
    }

    switch (action) {
      case "getSuggestions":
        const suggestions = await handleGetSuggestions(payload);
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(suggestions)
        };

      case "generateImage":
        const imageData = await handleGenerateImage(payload);
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(imageData)
        };

      default:
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Ação desconhecida" }),
        };
    }
  } catch (error) {
    console.error("Erro no proxy da API Gemini:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Erro interno no servidor";
    return {
        statusCode: 500,
        body: JSON.stringify({ error: errorMessage })
    };
  }
};

export { handler };
