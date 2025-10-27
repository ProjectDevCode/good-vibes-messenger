// Este arquivo deve estar em: api/gemini-proxy.ts

import { GoogleGenAI, Type, Modality } from "@google/genai";

// A importação de '@vercel/node' foi removida.
// Os tipos de 'request' e 'response' são inferidos ou tratados como 'any',
// o que é seguro neste contexto, pois a Vercel garante a estrutura desses objetos.
export default async function handler(request: any, response: any) {
  // Verifica se a chave de API está configurada nas variáveis de ambiente da Vercel
  if (!process.env.GEMINI_API_KEY) {
    return response.status(500).json({ error: "A chave de API do Gemini não foi configurada no servidor. Verifique as variáveis de ambiente do projeto na Vercel." });
  }

  // Inicializa a biblioteca da IA com a chave segura
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  if (request.method !== "POST") {
    return response.status(405).json({ error: "Método não permitido" });
  }

  try {
    const { action, payload } = request.body || {};

    if (!action || !payload) {
      return response.status(400).json({ error: "Requisição inválida: 'action' e 'payload' são obrigatórios." });
    }

    // Rota para obter sugestões de mensagens
    if (action === "getSuggestions") {
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

    // Rota para gerar imagens
    if (action === "generateImage") {
      const { message, imageStyle, messageType } = payload;
      const prompt = `Crie uma imagem no estilo "${imageStyle}", inspirada no sentimento da seguinte mensagem: "${message}". A imagem deve ser vibrante, positiva e adequada para compartilhar em redes sociais. O ÚNICO texto que deve aparecer escrito na imagem é "${messageType}". O texto deve ser claro, legível e esteticamente agradável, integrado ao design da imagem.`;

      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: { responseModalities: [Modality.IMAGE] },
      });

      if (result.candidates?.[0]?.content?.parts) {
        for (const part of result.candidates[0].content.parts) {
          if (part.inlineData) {
            const imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            return response.status(200).json({ imageUrl });
          }
        }
      }
      throw new Error('Nenhuma imagem foi retornada pela IA.');
    }

    return response.status(400).json({ error: "Ação desconhecida." });

  } catch (error) {
    console.error("Erro na Vercel Function:", error);
    const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro interno no servidor.";
    
    if (errorMessage.includes('SAFETY')) {
        return response.status(400).json({ error: 'O conteúdo solicitado não pôde ser gerado devido às políticas de segurança. Tente uma mensagem diferente.' });
    }
    
    return response.status(500).json({ error: errorMessage });
  }
}
