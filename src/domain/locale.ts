export type Locale = "es" | "en";

// Texto en los dos idiomas, para datos (perfiles, servicios) que no viven en el diccionario.
export type Localized = Record<Locale, string>;
