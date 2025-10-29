import type { VercelRequest, VercelResponse } from '@vercel/node';

// Tipos definidos localmente para tornar a função autossuficiente e evitar erros de importação na Vercel.
enum MessageType {
  GOOD_MORNING = 'Bom dia',
  GOOD_NIGHT = 'Boa noite',
}

enum MessageTheme {
  GENERIC = 'Genérico',
  CHRISTIAN = 'Cristão',
}

enum ImageStyle {
  REALISTIC = 'Realista',
  HYPER_REALISTIC = 'Hiper-realista',
  DRAWING = 'Desenho',
  ABSTRACT = 'Abstrato',
  WATERCOLOR = 'Aquarela',
}

// --- LÓGICA PARA GERAÇÃO DE SUGESTÕES (GEMINI) ---
const getSuggestions = async (messageType: MessageType, theme: MessageTheme): Promise<string[]> => {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    throw new Error('A chave da API do Gemini não está configurada no servidor.');
  }

  const prompt = `Gere 3 sugestões de mensagens de "${messageType}" com um tema "${theme}". As mensagens devem ser curtas, inspiradoras, OBRIGATORIAMENTE incluir emojis relevantes e adequadas para compartilhar no WhatsApp. Retorne um array JSON de strings.`;
  
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        response_mime_type: "application/json",
        response_schema: {
            type: "ARRAY",
            items: { type: "STRING" }
        }
      }
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Erro da API Gemini:', errorData);
    throw new Error('Falha ao buscar sugestões na API do Gemini.');
  }

  const data = await response.json();
  const suggestionsText = data.candidates[0]?.content?.parts[0]?.text;
  
  if (!suggestionsText) {
    throw new Error('A API do Gemini não retornou sugestões.');
  }

  return JSON.parse(suggestionsText);
};

// --- LÓGICA PARA GERAÇÃO DE IMAGEM (HUGGING FACE) ---
const generateImage = async (
  message: string,
  imageStyle: ImageStyle,
  messageType: MessageType,
  theme: MessageTheme
): Promise<{ imageUrl: string }> => {
  const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;
  if (!HUGGINGFACE_API_KEY) {
    throw new Error('A chave da API do Hugging Face não está configurada no servidor.');
  }

  // Modelo de fallback, ultra-estável e popular
  const API_URL = "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0";

  let themeInfluence = '';
  if (theme === MessageTheme.CHRISTIAN) {
    themeInfluence = 'Incorpore elementos sutis como luz divina, raios de sol suaves, pombas brancas ou vitrais.';
  } else {
    themeInfluence = 'Use elementos como um belo nascer do sol, xícaras de café, flores ou paisagens tranquilas.';
  }

  const prompt = `Uma obra de arte digital no estilo ${imageStyle}, fotorrealista. A cena é inspirada pela mensagem: "${message}". ${themeInfluence} O foco PRINCIPAL e OBRIGATÓRIO da imagem é o texto "${messageType}" renderizado de forma clara, bonita e artística, perfeitamente integrado à cena. Apenas o texto "${messageType}" deve aparecer.`;
  const negative_prompt = 'texto feio, texto distorcido, texto ilegível, palavras extras, letras deformadas, pessoas, mulher, homem, figura humana, silhueta, marca d\'água, assinatura, baixa qualidade, desfocado';

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${HUGGINGFACE_API_KEY}`
    },
    body: JSON.stringify({ 
        inputs: prompt,
        parameters: { negative_prompt }
    }),
  });

  if (!response.ok) {
     const errorText = await response.text();
     console.error('Erro do Hugging Face:', errorText);
     throw new Error('Falha ao gerar imagem no Hugging Face.');
  }

  const imageBlob = await response.blob();
  const reader = new (require('stream').Readable)();
  reader._read = () => {};
  reader.push(Buffer.from(await imageBlob.arrayBuffer()));
  
  const chunks: Buffer[] = [];
  for await (const chunk of reader) {
    chunks.push(chunk);
  }
  
  const base64Image = Buffer.concat(chunks).toString('base64');
  const imageUrl = `data:${imageBlob.type};base64,${base64Image}`;

  return { imageUrl };
};

// --- HANDLER DA VERCEL FUNCTION ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { action, payload } = req.body;

    switch (action) {
      case 'getSuggestions': {
        const { messageType, theme } = payload;
        const suggestions = await getSuggestions(messageType, theme);
        return res.status(200).json(suggestions);
      }
      case 'generateImage': {
        const { message, imageStyle, messageType, theme } = payload;
        const result = await generateImage(message, imageStyle, messageType, theme);
        return res.status(200).json(result);
      }
      default:
        return res.status(400).json({ error: 'Ação inválida.' });
    }
  } catch (error) {
    console.error('[PROXY_ERROR]', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido no servidor.';
    res.status(500).json({ error: `Erro interno do servidor: ${errorMessage}` });
  }
}
