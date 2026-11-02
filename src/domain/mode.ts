// Modo (Buscar u Ofrecer) y nivel (Personal, Business o VIP).
// Por ahora se guardan en una cookie del navegador. Con el inicio de sesión (Fase 2)
// y los pagos (Fase 4) pasan a la cuenta de cada persona.

export type Mode = "buscar" | "ofrecer";
export type Level = "personal" | "business" | "vip";

export const MODE_HOME: Record<Mode, string> = { buscar: "/", ofrecer: "/panel" };

export function parseMode(v: string | undefined): Mode {
  return v === "ofrecer" ? "ofrecer" : "buscar";
}

export function parseLevel(v: string | undefined): Level {
  return v === "business" || v === "vip" ? v : "personal";
}

export const LEVEL_COLOR: Record<Level, string> = {
  personal: "#EFE6D8",
  business: "#8FB0D0",
  vip: "#D8B170",
};

// Experiencia: qué le interesa a la persona. Lifestyle (vivir experiencias), Business (talento,
// equipos y reventa) o las dos. Con "las dos", el lente elige qué se ve ahora mismo.
export type Experience = "lifestyle" | "business" | "both";
export type Lens = "all" | "lifestyle" | "business";
export type View = "lifestyle" | "business";

export function parseExperience(v: string | undefined | null): Experience | null {
  return v === "lifestyle" || v === "business" || v === "both" ? v : null;
}

export function parseLens(v: string | undefined): Lens {
  return v === "lifestyle" || v === "business" ? v : "all";
}

// Qué experiencia se está mostrando (define colores, pantallas y el tono de la IA).
export function viewOf(exp: Experience | null, lens: Lens): View {
  if (exp === "business") return "business";
  if (exp === "both" && lens === "business") return "business";
  return "lifestyle";
}

// Un solo interruptor: Personal ("Vive Miami", turquesa) o Business ("Construye en Miami", dorado).
// Enterprise es un tipo de cuenta dentro de Business (lo decide el Diagnóstico).
export type Side = "personal" | "business";

export function parseSide(v: string | undefined | null): Side | null {
  return v === "personal" || v === "business" ? v : null;
}

// En la base de datos Personal se guarda como 'lifestyle' (columna experience de 002).
export const sideToExperience = (s: Side) => (s === "business" ? "business" : "lifestyle");
export const experienceToSide = (e: string | null | undefined): Side | null => (e === "business" ? "business" : e === "lifestyle" || e === "both" ? "personal" : null);
export const SIDE_HOME: Record<Side, string> = { personal: "/", business: "/panel" };
