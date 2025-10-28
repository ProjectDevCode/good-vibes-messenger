// Este arquivo deve estar em: api/gemini-proxy.ts

import { GoogleGenAI, Type } from "@google/genai";

// Os tipos de 'request' e 'response' são inferidos ou tratados como 'any',
// o que é seguro neste contexto, pois a Vercel garante a estrutura desses objetos.
export default async function handler(request: any, response: any) {
  // LOG DE DIAGNÓSTICO: Verificando a variável de ambiente do Gemini
  console.log("Iniciando a função do servidor...");
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10) {
    console.log("Variável de ambiente GEMINI_API_KEY encontrada com sucesso.");
  } else {
    console.error("ERRO CRÍTICO: Variável de ambiente GEMINI_API_KEY não encontrada ou está vazia!");
  }
  
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
        if (!process.env.GEMINI_API_KEY) {
            return response.status(500).json({ error: "A chave de API do Gemini não foi configurada no servidor. Verifique as variáveis de ambiente do projeto na Vercel." });
        }
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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

    // Rota para gerar imagens (AGORA USA Stable Horde - a solução gratuita e comunitária)
    if (action === "generateImage") {
      const hordeApiKey = process.env.STABLE_HORDE_API_KEY || '0000000000';
      console.log("Usando a chave da API do Stable Horde.");

      const { message, imageStyle, messageType } = payload;
      const prompt = `Estilo: ${imageStyle}. Uma imagem vibrante, positiva, e inspiradora sobre "${message}". O ÚNICO texto escrito na imagem deve ser "${messageType}". O texto deve ser claro, legível e bem integrado ao design.`;
      
      // 1. Iniciar a geração da imagem
      const initialResponse = await fetch('https://stablehorde.net/api/v2/generate/async', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': hordeApiKey,
        },
        body: JSON.stringify({
          prompt: prompt,
          params: {
            sampler_name: 'k_dpmpp_2s_a',
            width: 512,
            height: 512,
            steps: 25,
          },
        }),
      });

      const initialData = await initialResponse.json();
      if (!initialResponse.ok || !initialData.id) {
        console.error("Erro ao iniciar a geração no Stable Horde:", initialData);
        throw new Error(`Falha ao iniciar a geração no Stable Horde: ${initialData.message || 'Erro desconhecido'}`);
      }
      
      const generationId = initialData.id;
      
      // 2. Verificar o status da geração até que esteja pronta
      let finalData;
      let retries = 0;
      const maxRetries = 20; // Espera no máximo 20 * 5s = 100 segundos

      while (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Espera 5 segundos

        const checkResponse = await fetch(`https://stablehorde.net/api/v2/generate/check/${generationId}`);
        const checkData = await checkResponse.json();

        if (checkData.done) {
          finalData = checkData;
          break;
        }
        retries++;
      }
      
      if (!finalData || finalData.generations.length === 0) {
        throw new Error('A geração da imagem demorou muito ou falhou no Stable Horde.');
      }
      
      const imageUrlFromApi = finalData.generations[0].img;
      const imageResponse = await fetch(imageUrlFromApi);
      if (!imageResponse.ok) {
          throw new Error('Não foi possível baixar a imagem gerada pelo Stable Horde.');
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const base64Image = Buffer.from(imageBuffer).toString('base64');
      const mimeType = imageResponse.headers.get('content-type') || 'image/webp';
      const imageUrl = `data:${mimeType};base64,${base64Image}`;

      return response.status(200).json({ imageUrl });
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
