export interface Contact {
  id: string;
  name: string;
  phone: string;
}

export enum MessageType {
  GOOD_MORNING = 'Bom dia',
  GOOD_NIGHT = 'Boa noite',
}

export enum MessageTheme {
  GENERIC = 'Genérico',
  CHRISTIAN = 'Cristão',
}

export enum ImageStyle {
  REALISTIC = 'Realista',
  HYPER_REALISTIC = 'Hiper-realista',
  DRAWING = 'Desenho',
  ABSTRACT = 'Abstrato',
  WATERCOLOR = 'Aquarela',
}