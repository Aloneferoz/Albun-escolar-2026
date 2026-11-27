import {
  DEFAULT_PALETTE_COLORS,
  FotoItem,
  NivelEducativo,
  PaletaVisual,
  PaletteColors,
  VideoItem
} from '../types/album';

export interface SeedAlbumTemplate {
  id: string;
  slug: string;
  colegio: string;
  promocion: string;
  nivel: NivelEducativo;
  anio: string;
  paleta: PaletaVisual;
  paletaConfig: PaletteColors;
  portadaUrl: string;
  musicaUrl: string;
  whatsappTexto: string;
  tutoraTitulo: string;
  tutoraNombre: string;
  tutoraCargo: string;
  tutoraFotoUrl: string;
  tutoraTexto: string;
  fotos: FotoItem[];
  videos: VideoItem[];
  alumnos: Array<{
    id: string;
    slug: string;
    nombre: string;
    frase: string;
    fotoUrl: string;
    parentPhone: string;
  }>;
}

export const DEFAULT_SEED_ALBUM: SeedAlbumTemplate = {
  id: 'santa-maria-2026',
  slug: 'santa-maria-2026',
  colegio: 'I.E.P. Santa María del Camino',
  promocion: 'Promoción 2026 - Pequeños Gigantes',
  nivel: 'Primaria',
  anio: '2026',
  paleta: 'primaria-azul-oro',
  paletaConfig: DEFAULT_PALETTE_COLORS,
  portadaUrl: '/src/assets/images/hero_promocion_1795554401911.jpg',
  musicaUrl: '',
  whatsappTexto:
    '¡Hola familia de {alumno}! Les compartimos con mucho cariño el Álbum Digital privado de la {promocion} ({colegio}). Pueden abrirlo directamente aquí: {link}',
  tutoraTitulo: 'Queridos pequeños gigantes, el mundo los espera',
  tutoraNombre: 'Prof. Gabriela Mendoza Ríos',
  tutoraCargo: 'Tutora de 6.º Grado de Primaria',
  tutoraFotoUrl: '/src/assets/images/retrato_tutora_1795554405296.jpg',
  tutoraTexto:
    'Hoy cerramos juntos una etapa llena de aprendizajes, cuadernos compartidos, risas en el recreo y sueños que recién comienzan a tomar vuelo.\n\nCada uno de ustedes dejó una huella imborrable en nuestra aula. Sigan caminando con curiosidad, respeto y alegría hacia la secundaria, sabiendo que siempre contarán con el cariño de sus familias y de su colegio.\n\nGracias a cada madre y padre de familia por confiar en nosotros y acompañar cada paso de este hermoso año.',
  fotos: [
    {
      titulo: 'Ceremonia de clausura y entrega de diplomas',
      categoria: 'Ceremonia',
      url: '/src/assets/images/foto_ceremonia_1795554404001.jpg',
      descargaUrl: '/src/assets/images/foto_ceremonia_1795554404001.jpg'
    },
    {
      titulo: 'Taller de proyectos y arte en aula',
      categoria: 'Estudio',
      url: '/src/assets/images/foto_estudio_1795554404647.jpg',
      descargaUrl: '/src/assets/images/foto_estudio_1795554404647.jpg'
    },
    {
      titulo: 'Compartir de despedida en el patio',
      categoria: 'Compartir',
      url: '/src/assets/images/foto_compartir_1795554405114.jpg',
      descargaUrl: '/src/assets/images/foto_compartir_1795554405114.jpg'
    },
    {
      titulo: 'Birretes, anuario y recuerdos de promoción',
      categoria: 'Ceremonia',
      url: '/src/assets/images/foto_birretes_1795554403590.jpg',
      descargaUrl: '/src/assets/images/foto_birretes_1795554403590.jpg'
    },
    {
      titulo: 'Mesa de diplomas en el jardín central',
      categoria: 'Ceremonia',
      url: '/src/assets/images/hero_promocion_1795554401911.jpg',
      descargaUrl: '/src/assets/images/hero_promocion_1795554401911.jpg'
    }
  ],
  videos: [
    {
      titulo: 'Resumen oficial: Ceremonia de Graduación 2026',
      duracion: '03:45',
      descripcion:
        'Ingreso de la promoción, entrega de diplomas y palabras de despedida en el auditorio.',
      portadaUrl: '/src/assets/images/foto_ceremonia_1795554404001.jpg',
      embedUrl: 'https://youtu.be/5AM6ecA8zrk'
    }
  ],
  alumnos: [
    {
      id: 'valeria-paredes',
      slug: 'valeria-paredes',
      nombre: 'Valeria Sofía Paredes',
      frase:
        'Gracias por cada risa en clase y por enseñarnos que juntos todo es más divertido.',
      fotoUrl: '/src/assets/images/alumno_1_1795554404726.jpg',
      parentPhone: ''
    },
    {
      id: 'mateo-quispe',
      slug: 'mateo-quispe',
      nombre: 'Mateo Alejandro Quispe',
      frase:
        'Me llevo a mis mejores amigos y los partidos inolvidables del recreo.',
      fotoUrl: '/src/assets/images/alumno_2_1795554405944.jpg',
      parentPhone: ''
    },
    {
      id: 'camila-torres',
      slug: 'camila-torres',
      nombre: 'Camila Fernanda Torres',
      frase:
        'Siempre recordaré con cariño a mi tutora y cada proyecto que hicimos en equipo.',
      fotoUrl: '/src/assets/images/alumno_3_1795554405267.jpg',
      parentPhone: ''
    },
    {
      id: 'luciana-salazar',
      slug: 'luciana-salazar',
      nombre: 'Luciana Andrea Salazar',
      frase:
        'Listos para la secundaria con el corazón lleno de gratitud y buenos recuerdos.',
      fotoUrl: '/src/assets/images/alumno_5_1795554406115.jpg',
      parentPhone: ''
    },
    {
      id: 'sebastian-rojas',
      slug: 'sebastian-rojas',
      nombre: 'Sebastián Nicolás Rojas',
      frase:
        'Promoción 2026 para toda la vida. ¡Nos vemos en la siguiente aventura!',
      fotoUrl: '/src/assets/images/alumno_6_1795554426713.jpg',
      parentPhone: ''
    }
  ]
};
