// Este arquivo deve estar em: api/gemini-proxy.ts

import { GoogleGenAI, Type } from "@google/genai";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';
import FormData from 'form-data';

// Função para converter um stream em um buffer, necessário para processar a imagem
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Método não permitido" });
  }

  try {
    const { action, payload } = request.body || {};

    if (!action || !payload) {
      return response.status(400).json({ error: "Requisição inválida: 'action' e 'payload' são obrigatórios." });
    }

    // Rota para obter sugestões de mensagens (continua usando Gemini)
    if (action === "getSuggestions") {
        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) {
            return response.status(500).json({ error: "A chave de API do Gemini não foi configurada no servidor." });
        }
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const { messageType, theme } = payload;
        const prompt = `Gere 3 sugestões de mensagens de "${messageType}" com um tema "${theme}". As mensagens devem ser curtas, inspiradoras, incluir emojis relevantes e adequadas para compartilhar no WhatsApp. Retorne um array JSON de strings.`;

        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
            },
            },
        });
      
      const suggestions = JSON.parse(result.text.trim());
      return response.status(200).json(suggestions);
    }

    // Rota para gerar imagens com ClipDrop (Stable Diffusion)
    if (action === "generateImage") {
      const clipdropApiKey = process.env.CLIPDROP_API_KEY;
      if (!clipdropApiKey) {
        return response.status(500).json({ error: "A chave de API do ClipDrop não foi configurada no servidor." });
      }

      const { message, imageStyle, messageType } = payload;
      const prompt = `Estilo: ${imageStyle}. Uma imagem vibrante, positiva, e inspiradora sobre "${message}". O ÚNICO texto escrito na imagem deve ser "${messageType}". O texto deve ser claro, legível e bem integrado ao design.`;

      const form = new FormData();
      form.append('prompt', prompt);

      const clipdropResponse = await fetch(
        'https://api.clipdrop.co/stable-diffusion/v1/text-to-image',
        {
          method: 'POST',
          headers: {
            'x-api-key': clipdropApiKey,
            ...form.getHeaders()
          },
          body: form,
        }
      );

      if (!clipdropResponse.ok) {
        const errorText = await clipdropResponse.text();
        console.error("Erro do ClipDrop:", errorText);
        throw new Error(`Falha ao gerar imagem com ClipDrop: ${errorText}`);
      }

      const imageBuffer = await streamToBuffer(clipdropResponse.body);
      const imageUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;
      
      return response.status(200).json({ imageUrl });
    }

    return response.status(400).json({ error: "Ação desconhecida." });

  } catch (error) {
    console.error("Erro na Vercel Function:", error);
    const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro interno no servidor.";
    return response.status(500).json({ error: errorMessage });
  }
}
