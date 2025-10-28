import { GoogleGenAI, Modality, Type } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Basic validation for the API key
if (!process.env.API_KEY) {
  throw new Error('A variável de ambiente API_KEY não está definida.');
}

// FIX: Initialize GoogleGenAI with a named apiKey parameter.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { action, payload } = req.body;

    switch (action) {
      case 'getSuggestions': {
        const { messageType, theme } = payload;
        const prompt = `Crie 3 sugestões curtas e inspiradoras para uma mensagem de "${messageType}" com o tema "${theme}". A resposta deve ser um array JSON de strings.`;

        // FIX: Implement API call to generate text suggestions using gemini-2.5-flash and JSON mode.
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
              },
            },
          },
        });

        // The response.text is a JSON string, so we parse it.
        const suggestions = JSON.parse(response.text);
        return res.status(200).json(suggestions);
      }

      case 'generateImage': {
        const { message, imageStyle, messageType, theme } = payload;
        const imagePrompt = `Crie uma imagem inspiradora no estilo "${imageStyle}" para ilustrar a seguinte mensagem de "${messageType}" com tema "${theme}": "${message}". A imagem deve ser visualmente atraente, positiva e adequada para compartilhamento em redes sociais.`;

        // FIX: Implement API call to generate an image using gemini-2.5-flash-image model.
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [{ text: imagePrompt }],
          },
          config: {
            responseModalities: [Modality.IMAGE],
          },
        });

        let base64ImageBytes: string | undefined;
        // According to guidelines, loop through parts to find inlineData
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            base64ImageBytes = part.inlineData.data;
            break;
          }
        }

        if (!base64ImageBytes) {
          throw new Error(
            'Não foi possível extrair os dados da imagem da resposta da API.'
          );
        }

        const imageUrl = `data:image/png;base64,${base64ImageBytes}`;
        return res.status(200).json({ imageUrl });
      }

      default:
        return res.status(400).json({ error: 'Ação desconhecida' });
    }
  } catch (error) {
    console.error('Erro no proxy da API Gemini:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Um erro inesperado ocorreu.';
    return res
      .status(500)
      .json({ error: `Erro interno do servidor: ${errorMessage}` });
  }
}
