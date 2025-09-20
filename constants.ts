import { Template } from './core/types/index.ts';

export const ALL_TAGS = ["Social Media", "E-commerce", "Sale", "Minimalist", "Bold", "Corporate", "Abstract", "Holiday", "Event", "Restaurant", "Fashion", "Technology"];

export const TEMPLATE_CATEGORIES = ["Marketing", "Greetings", "Announcements", "Invitations", "Business", "Personal"];

export const BRAND_PALETTES = {
    "Vibrant": ["#FF4081", "#7C4DFF", "#40C4FF", "#18FFFF"],
    "Corporate": ["#0D47A1", "#1976D2", "#42A5F5", "#90CAF9"],
    "Earthy": ["#3E2723", "#5D4037", "#A1887F", "#D7CCC8"],
    "Pastel": ["#FFCDD2", "#F8BBD0", "#E1BEE7", "#D1C4E9"],
    "Monochrome": ["#212121", "#616161", "#BDBDBD", "#F5F5F5"],
};

export interface TemplateBundle {
    title: string;
    description: string;
    coverUrl: string;
    templateIds: string[];
}

export const TEMPLATE_BUNDLES: TemplateBundle[] = [];

export const INITIAL_TEMPLATES: Template[] = [];

export const LEGACY_TEMPLATE_IDS = ['1', '2', '3', '4', '5', '6', '7', '8'];
export const LEGACY_TEMPLATE_IMAGE_PREFIXES = [
    'https://picsum.photos/',
    'https://picsum.photos/seed/template',
    'https://picsum.photos/seed/dummy',
    'https://picsum.photos/seed/bundle',
    'https://picsum.photos/seed/reflow',
    'https://picsum.photos/seed/variant'
];
