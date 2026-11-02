// Diagnóstico ARK: una conversación corta que entiende a la persona o empresa,
// y el ARK Snapshot que sale de ahí (modo, escalón, fortalezas, huecos, próximos pasos).
// Las reglas son simples y explicables ("Porque tú..."). En la etapa de IA real,
// Meta escribirá el resumen con estos mismos datos; los números nunca se inventan.
// Nunca pregunta ni deduce estatus migratorio, salud, religión, orientación ni política.
import type { Locale, Localized } from "./locale";
import type { Side } from "./mode";

export type Who = "individual" | "earner" | "company" | "enterprise";
export type Answers = Partial<Record<string, string | string[]>> & { who?: Who };

type Opt = { id: string; label: Localized };
export type Question = {
  id: string;
  ask: Localized;
  kind: "single" | "multi" | "text";
  options?: Opt[];
  placeholder?: Localized;
  showIf?: (a: Answers) => boolean;
};

const o = (id: string, es: string, en: string): Opt => ({ id, label: { es, en } });
const list = (a: Answers, id: string) => (Array.isArray(a[id]) ? (a[id] as string[]) : a[id] ? [a[id] as string] : []);

export const WHO: Question = {
  id: "who",
  ask: { es: "Hola, soy ARK IA. Para empezar, ¿qué te trae a ARK305?", en: "Hi, I'm ARK AI. To start, what brings you to ARK305?" },
  kind: "single",
  options: [
    o("individual", "Quiero vivir Miami", "I want to live Miami"),
    o("earner", "Quiero ganar con lo que sé hacer", "I want to earn with my skills"),
    o("company", "Tengo un negocio", "I run a business"),
    o("enterprise", "Represento una empresa grande", "I represent a large company"),
  ],
};

const INDIVIDUAL: Question[] = [
  {
    id: "interests",
    ask: { es: "Genial. ¿Qué te gusta hacer en tu tiempo libre en Miami?", en: "Great. What do you like to do with your free time in Miami?" },
    kind: "multi",
    options: [
      o("water", "El agua", "The water"),
      o("food", "Comer bien", "Great food"),
      o("night", "Salir de noche", "Nightlife"),
      o("wellness", "Bienestar", "Wellness"),
      o("family", "Planes en familia", "Family plans"),
      o("content", "Crear contenido", "Creating content"),
      o("clients", "Atender clientes", "Entertaining clients"),
    ],
  },
  {
    id: "group",
    ask: { es: "¿Con quién sueles hacer planes?", en: "Who do you usually make plans with?" },
    kind: "single",
    options: [o("solo", "Solo", "Solo"), o("couple", "En pareja", "As a couple"), o("friends", "Con amigos", "With friends"), o("family", "Con la familia", "With family"), o("clients", "Con clientes", "With clients")],
  },
  {
    id: "budget",
    ask: { es: "Para un día especial, ¿qué presupuesto te queda cómodo?", en: "For a special day, what budget feels comfortable?" },
    kind: "single",
    options: [o("smart", "Inteligente", "Smart"), o("signature", "Signature", "Signature"), o("nolimits", "Sin límites", "No limits")],
  },
  {
    id: "pace",
    ask: { es: "¿Cómo te gusta el ritmo?", en: "What pace do you like?" },
    kind: "single",
    options: [o("chill", "Tranquilo", "Chill"), o("full", "A tope", "Full-on")],
  },
  {
    id: "residency",
    ask: { es: "¿Vives en Miami todo el año?", en: "Do you live in Miami year-round?" },
    kind: "single",
    options: [o("full", "Todo el año", "Year-round"), o("season", "Por temporada", "Seasonally"), o("visit", "De visita", "Visiting")],
  },
  {
    id: "support",
    ask: { es: "¿Ya tienes ayuda en casa o en tu día a día?", en: "Do you already have help at home or day to day?" },
    kind: "single",
    options: [o("none", "Nada todavía", "Nothing yet"), o("some", "Algo", "Some"), o("team", "Un equipo completo", "A full team")],
  },
  {
    id: "offer",
    ask: { es: "En ARK todos pueden contratar y también ofrecer. ¿Te gustaría ganar algo aquí?", en: "On ARK everyone can hire and also offer. Would you like to earn something here?" },
    kind: "multi",
    options: [o("skills", "Con lo que sé hacer", "With my skills"), o("assets", "Con mis cosas (bote, carro, casa)", "With my things (boat, car, home)"), o("refer", "Recomendando gente", "By referring people"), o("no", "Por ahora no", "Not for now")],
  },
];

const EARNER: Question[] = [
  {
    id: "skills",
    ask: { es: "Perfecto. ¿Qué sabes hacer hoy?", en: "Perfect. What can you do today?" },
    kind: "multi",
    options: [
      o("drive", "Manejar", "Driving"),
      o("photo", "Foto y video", "Photo & video"),
      o("ugc", "Contenido UGC", "UGC content"),
      o("edit", "Edición", "Editing"),
      o("assist", "Asistencia", "Assisting"),
      o("clean", "Limpieza", "Cleaning"),
      o("cook", "Cocina", "Cooking"),
      o("sales", "Ventas", "Sales"),
      o("tech", "Tecnología", "Tech"),
    ],
  },
  {
    id: "hours",
    ask: { es: "¿Cuántas horas a la semana tienes para trabajar?", en: "How many hours a week can you work?" },
    kind: "single",
    options: [o("5", "5", "5"), o("10", "10", "10"), o("20", "20", "20"), o("40", "40", "40")],
  },
  {
    id: "where",
    ask: { es: "¿Trabajarías en persona en Miami o remoto?", en: "Would you work in person in Miami or remotely?" },
    kind: "single",
    options: [o("miami", "En persona en Miami", "In person in Miami"), o("remote", "Remoto", "Remote"), o("both", "Las dos", "Both")],
  },
  {
    id: "country",
    ask: { es: "¿Desde qué país trabajarías?", en: "Which country would you work from?" },
    kind: "text",
    placeholder: { es: "Ej.: Colombia", en: "e.g. Colombia" },
    showIf: (a) => a.where === "remote",
  },
  {
    id: "assets",
    ask: { es: "¿Qué herramientas tienes?", en: "What tools do you have?" },
    kind: "multi",
    options: [o("car", "Carro", "Car"), o("camera", "Cámara", "Camera"), o("boat", "Licencia de bote", "Boat license"), o("laptop", "Laptop", "Laptop"), o("drone", "Drone", "Drone"), o("none", "Ninguna todavía", "None yet")],
  },
  {
    id: "blocker",
    ask: { es: "¿Qué te frena más hoy?", en: "What's holding you back most right now?" },
    kind: "single",
    options: [
      o("clients", "No tengo clientes", "No clients"),
      o("rates", "Cobro poco", "Low rates"),
      o("time", "No tengo tiempo", "No time"),
      o("skills", "Me faltan habilidades", "Missing skills"),
      o("trust", "No tengo reseñas", "No reviews yet"),
    ],
  },
  {
    id: "need",
    ask: { es: "¿Y qué te ayudaría más a crecer?", en: "And what would help you grow most?" },
    kind: "multi",
    options: [o("clients", "Clientes", "Clients"), o("training", "Capacitación", "Training"), o("team", "Un equipo", "A team"), o("tools", "Herramientas", "Tools"), o("funding", "Financiamiento", "Funding")],
  },
];

// Experiencias que necesita un negocio o empresa, y quién las recibe.
const EXP_FOR: Question = {
  id: "expFor",
  ask: { es: "Tu negocio también puede usar ARK para vivir experiencias. ¿Para quién serían?", en: "Your business can also use ARK for experiences. Who would they be for?" },
  kind: "multi",
  options: [
    o("clients", "Mis clientes", "My clients"),
    o("team", "Mi equipo", "My team"),
    o("vip", "Ejecutivos o VIP", "Executives or VIPs"),
    o("guests", "Invitados de eventos", "Event guests"),
    o("partners", "Socios o inversionistas", "Partners or investors"),
    o("none", "Por ahora no", "Not for now"),
  ],
};
const needsExperiences = (a: Answers) => list(a, "expFor").some((x) => x !== "none");
const EXP_TYPES: Question = {
  id: "expTypes",
  ask: { es: "¿Qué tipo de experiencias?", en: "What kind of experiences?" },
  kind: "multi",
  options: [
    o("entertain", "Cenas y yates con clientes", "Dinners and yachts with clients"),
    o("events", "Eventos y lanzamientos", "Events and launches"),
    o("offsite", "Retiros de equipo", "Team offsites"),
    o("travel", "Viajes ejecutivos", "Executive travel"),
    o("gifts", "Regalos e incentivos", "Gifts and incentives"),
    o("content", "Contenido para la marca", "Brand content"),
  ],
};
const EXP_FREQ: Question = {
  id: "expFreq",
  ask: { es: "¿Cada cuánto?", en: "How often?" },
  kind: "single",
  options: [o("once", "Una vez", "Once"), o("monthly", "Cada mes", "Monthly"), o("weekly", "Cada semana", "Weekly")],
};

const COMPANY: Question[] = [
  {
    id: "industry",
    ask: { es: "Buenísimo. ¿En qué industria está tu negocio?", en: "Great. What industry is your business in?" },
    kind: "single",
    options: [
      o("yachts", "Yates y charters", "Yachts & charters"),
      o("food", "Restaurante o noche", "Restaurant or nightlife"),
      o("transport", "Transporte", "Transportation"),
      o("realestate", "Bienes raíces", "Real estate"),
      o("brand", "Marca o creador", "Brand or creator"),
      o("other", "Otra", "Other"),
    ],
  },
  {
    id: "team",
    ask: { es: "¿De qué tamaño es tu negocio?", en: "How big is your business?" },
    kind: "single",
    options: [o("solo", "Solo yo", "Just me"), o("small", "Pequeño (2 a 10)", "Small (2–10)"), o("medium", "Mediano (11 a 100)", "Medium (11–100)"), o("large", "Grande (más de 100)", "Large (100+)")],
  },
  {
    id: "revenue",
    ask: { es: "¿Cuánto factura al mes, más o menos?", en: "Roughly how much does it bill per month?" },
    kind: "single",
    options: [o("lt5", "Menos de $5k", "Under $5k"), o("5-20", "$5k a $20k", "$5k to $20k"), o("20-100", "$20k a $100k", "$20k to $100k"), o("100+", "Más de $100k", "Over $100k")],
  },
  {
    id: "breaking",
    ask: { es: "¿Qué es lo que más se está rompiendo?", en: "What's breaking the most?" },
    kind: "single",
    options: [o("demand", "Me faltan clientes", "Not enough clients"), o("delivery", "Cumplir a tiempo", "Delivering on time"), o("staffing", "Conseguir personal", "Finding staff"), o("cash", "El flujo de caja", "Cash flow"), o("admin", "La administración", "Admin work")],
  },
  {
    id: "goal",
    ask: { es: "¿Y tu meta para los próximos 12 meses?", en: "And your goal for the next 12 months?" },
    kind: "single",
    options: [o("grow", "Crecer", "Grow"), o("hire", "Contratar", "Hire"), o("systems", "Ordenar procesos", "Systematize"), o("expand", "Expandirme", "Expand"), o("sell", "Vender el negocio", "Sell the business")],
  },
  EXP_FOR,
  { ...EXP_TYPES, showIf: needsExperiences },
  { ...EXP_FREQ, showIf: needsExperiences },
];

const ENTERPRISE: Question[] = [
  { id: "industry", ask: { es: "Gracias. ¿En qué industria está la empresa?", en: "Thanks. What industry is the company in?" }, kind: "text", placeholder: { es: "Ej.: hotelería, banca, tecnología", en: "e.g. hospitality, banking, tech" } },
  {
    id: "size",
    ask: { es: "¿De qué tamaño es?", en: "How big is it?" },
    kind: "single",
    options: [o("50", "50 a 200 personas", "50–200 people"), o("200", "200 a 1,000", "200–1,000"), o("1000", "Más de 1,000", "Over 1,000")],
  },
  {
    id: "needs",
    ask: { es: "¿Qué necesitan de ARK?", en: "What do you need from ARK?" },
    kind: "multi",
    options: [o("events", "Eventos y offsites", "Events & offsites"), o("travel", "Viajes ejecutivos", "Executive travel"), o("staffing", "Personal a escala", "Staffing at scale"), o("remote", "Equipos remotos", "Remote teams"), o("deals", "Compras de empresas", "Acquisitions")],
  },
  { ...EXP_FOR, id: "expFor", showIf: (a) => list(a, "needs").some((n) => n === "events" || n === "travel") },
  {
    id: "offer",
    ask: { es: "¿La empresa también ofrece algo que otros puedan contratar en ARK?", en: "Does the company also offer something others could book on ARK?" },
    kind: "multi",
    options: [o("venues", "Espacios o venues", "Spaces or venues"), o("products", "Productos", "Products"), o("services", "Servicios corporativos", "Corporate services"), o("sponsor", "Patrocinios", "Sponsorships"), o("no", "Por ahora no", "Not for now")],
  },
  {
    id: "approval",
    ask: { es: "¿Quién aprueba las compras y cada cuánto se define el presupuesto?", en: "Who approves purchases, and how often is the budget set?" },
    kind: "text",
    placeholder: { es: "Ej.: Dirección de operaciones, trimestral", en: "e.g. Head of operations, quarterly" },
  },
];

export const FLOWS: Record<Who, Question[]> = { individual: INDIVIDUAL, earner: EARNER, company: COMPANY, enterprise: ENTERPRISE };

// Siguiente pregunta sin responder (salta las que no aplican). null = terminado.
export function nextQuestion(a: Answers): Question | null {
  if (!a.who) return WHO;
  return FLOWS[a.who].find((q) => a[q.id] === undefined && (!q.showIf || q.showIf(a))) ?? null;
}

export function progress(a: Answers) {
  if (!a.who) return { done: 0, total: 6 };
  const qs = FLOWS[a.who].filter((q) => !q.showIf || q.showIf(a));
  return { done: 1 + qs.filter((q) => a[q.id] !== undefined).length, total: 1 + qs.length };
}

export function answerLabel(q: Question, value: string | string[] | undefined, locale: Locale): string {
  if (value === undefined) return "—";
  if (q.kind === "text") return String(value) || "—";
  const ids = Array.isArray(value) ? value : [value];
  return ids.map((id) => q.options?.find((x) => x.id === id)?.label[locale] ?? id).join(", ") || "—";
}

export function allQuestions(a: Answers): Question[] {
  return a.who ? [WHO, ...FLOWS[a.who]] : [WHO];
}

// Limpia respuestas que llegan del teléfono: solo preguntas y opciones conocidas.
export function sanitize(raw: unknown): Answers {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Answers = {};
  const who = a.who;
  if (who === "individual" || who === "earner" || who === "company" || who === "enterprise") out.who = who;
  if (!out.who) return out;
  for (const q of FLOWS[out.who]) {
    const v = a[q.id];
    if (v === undefined) continue;
    if (q.kind === "text") out[q.id] = String(v).slice(0, 120);
    else if (q.kind === "single" && typeof v === "string" && (v === "" || q.options!.some((x) => x.id === v))) out[q.id] = v;
    else if (q.kind === "multi" && Array.isArray(v)) out[q.id] = v.filter((x) => q.options!.some((y) => y.id === x)).slice(0, 10) as string[];
  }
  return out;
}

// ---------- ARK Snapshot ----------

export type Ladder = "starter" | "pro" | "operator" | "owner" | "exit";
export type Action = { label: Localized; href: string };
export type Snapshot = {
  who: Who;
  side: Side;
  enterprise: boolean;
  ladder: Ladder | null;
  summary: Localized;
  reason: Localized;
  strengths: Localized[];
  gaps: Localized[];
  opportunities: Localized[];
  actions: Action[];
  course: { id: string; reason: Localized };
  dayPrompt?: Localized;
  health?: { score: number; metric: Localized };
  blueprint?: string[]; // ids de puestos de Talento
  // Todos pueden ser cliente y proveedor a la vez:
  demand: Localized[]; // lo que necesita de ARK
  supply: Localized[]; // lo que puede ofrecer en ARK
  size?: Localized; // pequeño, mediano o grande
  experiences?: { recipients: Localized; kinds: Localized; freq?: Localized; prompt: Localized };
};

const L = (es: string, en: string): Localized => ({ es, en });
const pick = <T>(xs: T[], n = 3) => xs.filter(Boolean).slice(0, n);

const INTEREST: Record<string, Localized> = {
  water: L("el agua", "the water"),
  food: L("comer bien", "great food"),
  night: L("la noche", "nightlife"),
  wellness: L("el bienestar", "wellness"),
  family: L("los planes en familia", "family plans"),
  content: L("crear contenido", "creating content"),
  clients: L("atender clientes", "entertaining clients"),
};
const SKILL: Record<string, Localized> = {
  drive: L("manejar", "driving"),
  photo: L("foto y video", "photo & video"),
  ugc: L("contenido UGC", "UGC content"),
  edit: L("edición", "editing"),
  assist: L("asistencia", "assisting"),
  clean: L("limpieza", "cleaning"),
  cook: L("cocina", "cooking"),
  sales: L("ventas", "sales"),
  tech: L("tecnología", "tech"),
};
const joinL = (xs: Localized[]): Localized => ({
  es: xs.map((x) => x.es).join(", ").replace(/, ([^,]*)$/, " y $1"),
  en: xs.map((x) => x.en).join(", ").replace(/, ([^,]*)$/, " and $1"),
});

// Primer curso según lo que la persona sabe hacer o necesita.
const COURSE_FOR_SKILL: Record<string, string> = { photo: "photo", ugc: "ugc", edit: "reels", cook: "chef", sales: "crm", assist: "concierge", drive: "provider", clean: "provider", tech: "crm" };

// Plan de contratación de ejemplo por industria (se completa en la etapa del Plan de contratación).
export const PLAYBOOK: Record<string, string[]> = {
  yachts: ["r-recep", "r-reel", "r-cm"], // capitán y tripulación llegan con los planes por industria
  food: ["chef", "r-smm", "r-recep"],
  transport: ["suv", "r-recep", "r-book"],
  realestate: ["photo", "drone", "r-va"],
  brand: ["r-ugc", "r-reel", "r-cm", "r-setter"],
  other: ["r-va", "r-book", "r-crm"],
};

type Base = Omit<Snapshot, "demand" | "supply" | "size" | "experiences">;

const RECIPIENT: Record<string, Localized> = {
  clients: L("tus clientes", "your clients"),
  team: L("tu equipo", "your team"),
  vip: L("ejecutivos VIP", "VIP executives"),
  guests: L("invitados de eventos", "event guests"),
  partners: L("socios", "partners"),
};
const EXP_KIND: Record<string, Localized> = {
  entertain: L("yates con cena", "yacht dinners"),
  events: L("eventos de lanzamiento", "launch events"),
  offsite: L("retiros de equipo", "team offsites"),
  travel: L("viajes ejecutivos", "executive travel"),
  gifts: L("regalos corporativos", "corporate gifts"),
  content: L("contenido de marca", "brand content"),
};
const SIZE: Record<string, Localized> = {
  solo: L("Negocio de una persona", "One-person business"),
  small: L("Negocio pequeño", "Small business"),
  medium: L("Negocio mediano", "Medium business"),
  large: L("Negocio grande", "Large business"),
  "50": L("Empresa grande (50 a 200)", "Large company (50–200)"),
  "200": L("Empresa grande (200 a 1,000)", "Large company (200–1,000)"),
  "1000": L("Corporación (más de 1,000)", "Corporation (1,000+)"),
};
const INDUSTRY: Record<string, Localized> = {
  yachts: L("yates y charters", "yachts and charters"),
  food: L("restaurante o noche", "restaurant or nightlife"),
  transport: L("transporte", "transportation"),
  realestate: L("bienes raíces", "real estate"),
  brand: L("tu marca", "your brand"),
  other: L("tus servicios", "your services"),
};

// Lo que cada persona o negocio necesita y lo que puede ofrecer (todos son las dos cosas).
function market(a: Answers, base: Base): Snapshot {
  const demand: Localized[] = [];
  const supply: Localized[] = [];
  let experiences: Snapshot["experiences"];

  if (a.who === "individual") {
    demand.push(L("Días y experiencias en Miami", "Days and experiences in Miami"));
    if (a.support === "none" || a.support === "some") demand.push(L("Ayuda fija en casa y en tu día", "Regular help at home and day to day"));
    const offer = list(a, "offer");
    if (offer.includes("skills")) supply.push(L("Tus habilidades, por horas o por proyecto", "Your skills, hourly or per project"));
    if (offer.includes("assets")) supply.push(L("Tus cosas: bote, carro o casa, con reserva", "Your things: boat, car or home, bookable"));
    if (offer.includes("refer")) supply.push(L("Recomendar clientes y proveedores", "Referring clients and providers"));
  }
  if (a.who === "earner") {
    const needs: Record<string, Localized> = {
      clients: L("Clientes", "Clients"),
      training: L("Capacitación y certificados", "Training and certificates"),
      team: L("Un equipo para crecer", "A team to grow"),
      tools: L("Herramientas (CRM, agenda, cobros)", "Tools (CRM, calendar, payments)"),
      funding: L("Financiamiento (cuando tengas historial en ARK)", "Funding (once you have history on ARK)"),
    };
    list(a, "need").forEach((n) => needs[n] && demand.push(needs[n]));
    list(a, "skills").forEach((s) => SKILL[s] && supply.push(L(`Tu servicio de ${SKILL[s].es}`, `Your ${SKILL[s].en} service`)));
    list(a, "assets")
      .filter((x) => x !== "none" && x !== "laptop")
      .forEach(() => supply.length < 5 && supply.push(L("Tus herramientas incluidas en el servicio", "Your equipment included in the service")));
  }
  if (a.who === "company" || a.who === "enterprise") {
    if (a.who === "company") supply.push(L(`Lo que vendes: ${INDUSTRY[(a.industry as string) ?? "other"].es}`, `What you sell: ${INDUSTRY[(a.industry as string) ?? "other"].en}`));
    list(a, "offer")
      .filter((x) => x !== "no")
      .forEach((x) => {
        const m: Record<string, Localized> = {
          venues: L("Tus espacios para eventos", "Your spaces for events"),
          products: L("Tus productos", "Your products"),
          services: L("Tus servicios corporativos", "Your corporate services"),
          sponsor: L("Patrocinios", "Sponsorships"),
        };
        if (m[x]) supply.push(m[x]);
      });
    if (a.breaking === "staffing" || a.goal === "hire") demand.push(L("Talento y equipos", "Talent and teams"));
    if (a.breaking === "demand" || a.goal === "grow") demand.push(L("Más clientes", "More clients"));
    list(a, "needs").forEach((n) => {
      const m: Record<string, Localized> = {
        events: L("Eventos y offsites", "Events and offsites"),
        travel: L("Viajes ejecutivos", "Executive travel"),
        staffing: L("Personal a escala", "Staffing at scale"),
        remote: L("Equipos remotos", "Remote teams"),
        deals: L("Compras de empresas (con asesores con licencia)", "Acquisitions (with licensed advisors)"),
      };
      if (m[n]) demand.push(m[n]);
    });

    const recips = list(a, "expFor").filter((x) => x !== "none" && RECIPIENT[x]);
    if (recips.length) {
      const kinds = list(a, "expTypes").map((k) => EXP_KIND[k]).filter(Boolean);
      const r = joinL(recips.map((x) => RECIPIENT[x]));
      const k = kinds.length ? joinL(kinds) : L("experiencias", "experiences");
      const freq = a.expFreq === "weekly" ? L("cada semana", "every week") : a.expFreq === "monthly" ? L("cada mes", "every month") : a.expFreq === "once" ? L("una vez", "once") : undefined;
      experiences = {
        recipients: r,
        kinds: k,
        freq,
        prompt: L(
          recips.includes("clients") ? "Cena y yate para 8 clientes" : recips.includes("team") ? "Retiro de equipo para 12, algo en el agua y cena" : "Evento para 20 invitados con chef y fotos",
          recips.includes("clients") ? "Dinner and a yacht for 8 clients" : recips.includes("team") ? "Team offsite for 12, something on the water and dinner" : "Event for 20 guests with a chef and photos",
        ),
      };
      demand.push(L(`Experiencias para ${r.es}`, `Experiences for ${r.en}`));
    }
  }

  const size = a.who === "company" ? SIZE[a.team as string] : a.who === "enterprise" ? SIZE[a.size as string] : undefined;
  const snap: Snapshot = { ...base, demand: pick(demand, 4), supply: pick(supply, 4), size, experiences };

  // Si puede ofrecer algo, un paso concreto para empezar; si necesita experiencias, uno para armarlas.
  if (a.who === "individual" && supply.length) {
    snap.opportunities = [L("Gana en ARK con lo que ya tienes", "Earn on ARK with what you already have"), ...snap.opportunities].slice(0, 3);
    snap.actions = [...snap.actions.slice(0, 2), { label: L("Publica lo que ofreces", "Publish what you offer"), href: "/perfil/editar" }];
  }
  if (experiences) {
    snap.opportunities = [
      a.expFreq === "monthly" || a.expFreq === "weekly"
        ? L(`Plan de experiencias ${experiences.freq?.es} para ${experiences.recipients.es}`, `An experience plan ${experiences.freq?.en} for ${experiences.recipients.en}`)
        : L(`Experiencias para ${experiences.recipients.es}, con una sola factura`, `Experiences for ${experiences.recipients.en}, on one invoice`),
      ...snap.opportunities,
    ].slice(0, 3);
    snap.actions = [snap.actions[0], { label: L(`Arma una experiencia para ${experiences.recipients.es}`, `Plan an experience for ${experiences.recipients.en}`), href: `/mi-dia?q=${encodeURIComponent(experiences.prompt.es)}` }, snap.actions[1]];
  }
  if (a.who === "company" && a.team === "large") snap.enterprise = true;
  return snap;
}

export function buildSnapshot(a: Answers): Snapshot | null {
  const base = baseSnapshot(a);
  return base ? market(a, base) : null;
}

function baseSnapshot(a: Answers): Base | null {
  if (!a.who) return null;

  if (a.who === "individual") {
    const ints = list(a, "interests").map((i) => INTEREST[i]).filter(Boolean);
    const top = ints.length ? joinL(ints.slice(0, 2)) : L("descubrir Miami", "discovering Miami");
    const seasonal = a.residency === "season" || a.residency === "visit";
    const tier = a.budget === "nolimits" ? L("Sin límites", "No limits") : a.budget === "signature" ? L("Signature", "Signature") : L("Inteligente", "Smart");
    const water = list(a, "interests").includes("water");
    return {
      who: "individual",
      side: "personal",
      enterprise: false,
      ladder: null,
      summary: L(`Vives Miami a tu manera: te mueve ${top.es}.`, `You live Miami your way: you're into ${top.en}.`),
      reason: L("Estás en Personal porque viniste a disfrutar Miami, no a vender.", "You're in Personal because you came to enjoy Miami, not to sell."),
      strengths: pick([
        ints.length ? L(`Sabes lo que te gusta: ${top.es}`, `You know what you like: ${top.en}`) : L("Estás abierto a descubrir", "You're open to discovering"),
        a.group && a.group !== "solo" ? L("Planeas en grupo: ARK coordina a todos", "You plan as a group: ARK coordinates everyone") : L("Te mueves con libertad", "You move freely"),
        a.budget ? L(`Presupuesto claro (${tier.es})`, `A clear budget (${tier.en})`) : L("Flexible con el presupuesto", "Flexible on budget"),
      ]),
      gaps: pick([
        a.support === "none" || !a.support ? L("Todavía no tienes un equipo fijo que te ayude", "You don't have a regular support team yet") : null,
        L("Confirma los detalles de tu plan antes de enviar solicitudes", "Confirm your plan details before sending requests"),
        L("Todavía no sigues a proveedores", "You're not following providers yet"),
        seasonal ? L("Tu casa queda sola cuando no estás", "Your home sits empty while you're away") : null,
      ] as Localized[]),
      opportunities: pick([
        water ? L("Días armados en el agua", "Ready-made days on the water") : L("Días armados para tu estilo", "Ready-made days for your style"),
        seasonal ? L("Plan de temporada: tu equipo listo antes de llegar", "Seasonal plan: your team ready before you land") : L("Plan de vida: chofer, chef y asistente fijos", "Lifestyle plan: a regular driver, chef and assistant"),
        L("ARK Pass: descuento en todo tu día", "ARK Pass: a discount on your whole day"),
      ]),
      actions: [
        { label: L("Arma tu primer día con ARK IA", "Plan your first day with ARK AI"), href: "/mi-dia" },
        { label: L("Descubre proveedores para ti", "Discover providers for you"), href: "/descubrir" },
        { label: L("Guarda tu perfil", "Save your profile"), href: "/perfil" },
      ],
      course: water ? { id: "nautical", reason: L("Porque te gusta el agua", "Because you love the water") } : { id: "concierge", reason: L("Para sacarle todo a Miami", "To get the most out of Miami") },
      dayPrompt: L(
        `${a.group === "friends" ? "Sábado con amigos" : a.group === "family" ? "Domingo en familia" : a.group === "couple" ? "Día en pareja" : a.group === "clients" ? "Día con clientes" : "Mi día"}${water ? ", algo en el agua" : ""}${list(a, "interests").includes("food") ? " y cena" : ""}${list(a, "interests").includes("night") ? " y noche" : ""}`,
        `${a.group === "friends" ? "Saturday with friends" : a.group === "family" ? "Family Sunday" : a.group === "couple" ? "A day for two" : a.group === "clients" ? "A day with clients" : "My day"}${water ? ", something on the water" : ""}${list(a, "interests").includes("food") ? " and dinner" : ""}${list(a, "interests").includes("night") ? " and a night out" : ""}`,
      ),
    };
  }

  if (a.who === "earner") {
    const skills = list(a, "skills");
    const sk = skills.map((s) => SKILL[s]).filter(Boolean);
    const topSkills = sk.length ? joinL(sk.slice(0, 2)) : L("lo que sabes hacer", "your skills");
    const ladder: Ladder = a.blocker === "clients" || a.blocker === "skills" || !a.blocker ? "starter" : "pro";
    const hours = a.hours ? Number(a.hours) : null;
    const remote = a.where === "remote";
    const assets = list(a, "assets").filter((x) => x !== "none");
    const blockerGap: Record<string, Localized> = {
      clients: L("Todavía no tienes clientes en ARK", "No clients on ARK yet"),
      rates: L("Tus tarifas están por debajo de lo que podrías cobrar", "Your rates are below what you could charge"),
      time: L("Poco tiempo disponible: hay que elegir bien los trabajos", "Little time: you need to pick jobs well"),
      skills: L("Te falta una certificación para tu primer rol", "You need a certification for your first role"),
      trust: L("Sin reseñas, los clientes dudan", "Without reviews, clients hesitate"),
    };
    const course = COURSE_FOR_SKILL[skills[0]] ?? "provider";
    return {
      who: "earner",
      side: "business",
      enterprise: false,
      ladder,
      summary: L(
        `Quieres ganar con ${topSkills.es}${hours ? `, ${hours} h por semana` : ""}${remote ? ", remoto" : a.where === "miami" ? ", en Miami" : ""}.`,
        `You want to earn with ${topSkills.en}${hours ? `, ${hours} h a week` : ""}${remote ? ", remotely" : a.where === "miami" ? ", in Miami" : ""}.`,
      ),
      reason:
        ladder === "starter"
          ? L("Empiezas en Starter: el objetivo es tu primer trabajo en ARK.", "You start at Starter: the goal is your first job on ARK.")
          : L("Empiezas en Pro: ya trabajas, ahora toca reputación y mejores tarifas.", "You start at Pro: you already work, now it's about reputation and better rates."),
      strengths: pick([
        sk.length ? L(`Sabes ${topSkills.es}`, `You know ${topSkills.en}`) : null,
        assets.length ? L("Tienes herramientas propias para trabajar", "You have your own tools") : null,
        hours && hours >= 20 ? L("Tienes tiempo para crecer rápido", "You have time to grow fast") : L("Puedes empezar sin dejar lo que haces", "You can start without quitting what you do"),
        remote ? L("Puedes trabajar para clientes de EE. UU. desde donde estás", "You can work for US clients from where you are") : L("Estás en Miami, donde está la demanda", "You're in Miami, where the demand is"),
      ] as Localized[]),
      gaps: pick([
        a.blocker ? blockerGap[a.blocker as string] : null,
        L("Todavía no tienes un servicio publicado con precio", "No priced service published yet"),
        L("Sin certificación ARK en tu perfil", "No ARK certification on your profile"),
      ] as Localized[]),
      opportunities: pick([
        L("Publica tu servicio y aparece en Descubrir", "Publish your service and show up in Discover"),
        remote ? L("Roles remotos en Talento con pago semanal", "Remote roles in Talent with weekly pay") : L("Roles presenciales en Talento para empezar ya", "In-person roles in Talent to start now"),
        L("Súmate a paquetes de otros proveedores", "Join other providers' bundles"),
      ]),
      actions: [
        { label: L("Haz tu primer curso", "Take your first course"), href: "/academia" },
        { label: L("Publica tu primer servicio", "Publish your first service"), href: "/perfil/editar" },
        { label: L("Mira las tarifas de tu rol", "See the rates for your role"), href: "/talento" },
      ],
      course: { id: course, reason: sk.length ? L(`Porque sabes ${sk[0].es}`, `Because you know ${sk[0].en}`) : L("Es el curso obligatorio para empezar", "It's the required course to start") },
    };
  }

  if (a.who === "company") {
    const rev = a.revenue as string | undefined;
    const ladder: Ladder = rev === "20-100" || rev === "100+" || a.team === "medium" || a.team === "large" ? "owner" : "operator";
    const score = Math.max(
      30,
      Math.min(90, 45 + ({ lt5: 0, "5-20": 10, "20-100": 18, "100+": 25 }[rev ?? ""] ?? 5) + ({ solo: 0, small: 5, medium: 8, large: 10 }[(a.team as string) ?? ""] ?? 0) - (a.breaking === "cash" ? 10 : 5)),
    );
    const metric: Record<string, Localized> = {
      demand: L("Clientes nuevos por mes", "New clients per month"),
      delivery: L("Entregas a tiempo", "On-time deliveries"),
      staffing: L("Horas cubiertas por tu equipo", "Hours covered by your team"),
      cash: L("Días para cobrar", "Days to get paid"),
      admin: L("Horas de administración por semana", "Admin hours per week"),
    };
    const industry = (a.industry as string) ?? "other";
    return {
      who: "company",
      side: "business",
      enterprise: false,
      ladder,
      summary: L("Tienes un negocio en marcha y quieres llevarlo al siguiente nivel.", "You run a working business and want to take it to the next level."),
      reason:
        ladder === "owner"
          ? L("Estás en Owner por tu tamaño y facturación. Exit-ready llega con 12 meses de ingresos verificados en ARK.", "You're at Owner because of your size and revenue. Exit-ready comes with 12 months of verified revenue on ARK.")
          : L("Estás en Operator: el siguiente paso es armar y ordenar tu equipo.", "You're at Operator: the next step is building and organizing your team."),
      strengths: pick([
        L("Ya tienes clientes que pagan", "You already have paying clients"),
        a.team && a.team !== "solo" ? L("Tienes un equipo con el que construir", "You have a team to build with") : L("Decides rápido: eres el dueño y el equipo", "You decide fast: you're the owner and the team"),
        a.goal ? L("Tienes una meta clara para este año", "You have a clear goal for this year") : L("Estás abierto a crecer", "You're open to growing"),
      ]),
      gaps: pick([
        a.breaking ? L(`Lo que más se rompe: ${metric[a.breaking as string]?.es.toLowerCase()}`, `What breaks most: ${metric[a.breaking as string]?.en.toLowerCase()}`) : null,
        L("Sin ingresos verificados en ARK todavía", "No verified revenue on ARK yet"),
        a.team === "solo" ? L("Todo depende de ti", "Everything depends on you") : L("Tu equipo no está en un solo lugar", "Your team isn't in one place"),
      ] as Localized[]),
      opportunities: pick([
        L("Plan de contratación para tu industria", "A hiring plan for your industry"),
        L("Revende paquetes de ARK con tu margen", "Resell ARK bundles with your margin"),
        a.goal === "sell" ? L("Empieza hoy a construir el historial para vender", "Start building the track record to sell today") : L("Promociona tu perfil ante clientes nuevos", "Promote your profile to new clients"),
      ]),
      actions: [
        { label: L("Mira tu plan de contratación", "See your hiring plan"), href: "/equipo" },
        { label: L("Arma un paquete para revender", "Build a bundle to resell"), href: "/revender" },
        { label: L("Completa el perfil de tu negocio", "Complete your business profile"), href: "/perfil/editar" },
      ],
      course: { id: "crm", reason: L("Para no perder clientes en el seguimiento", "So you stop losing clients in follow-up") },
      health: { score, metric: metric[(a.breaking as string) ?? "demand"] ?? metric.demand },
      blueprint: PLAYBOOK[industry] ?? PLAYBOOK.other,
    };
  }

  // Enterprise: una cuenta dentro de Business.
  return {
    who: "enterprise",
    side: "business",
    enterprise: true,
    ladder: null,
    summary: L("Representas una empresa grande que necesita resolver Miami a escala.", "You represent a large company that needs Miami handled at scale."),
    reason: L("Tu cuenta es Enterprise, dentro de Business: equipos, eventos y aprobaciones en un solo lugar.", "Your account is Enterprise, within Business: teams, events and approvals in one place."),
    strengths: [L("Presupuesto y volumen", "Budget and volume"), L("Necesidades claras", "Clear needs"), L("Decisiones con proceso", "Decisions with a process")],
    gaps: [L("Proveedores dispersos", "Scattered vendors"), L("Facturación por separado", "Separate invoicing"), L("Sin reportes centralizados", "No centralized reporting")],
    opportunities: [L("Un solo contrato para eventos y personal", "One contract for events and staffing"), L("Equipos remotos de Latinoamérica", "Remote teams from Latin America"), L("Reportes y aprobaciones en ARK", "Reports and approvals in ARK")],
    actions: [
      { label: L("Arma un equipo a escala", "Build a team at scale"), href: "/equipo" },
      { label: L("Planea un evento", "Plan an event"), href: "/mi-dia" },
      { label: L("Revisa documentos y reportes", "Review documents and reports"), href: "/documentos" },
    ],
    course: { id: "concierge", reason: L("Para que tu equipo coordine con ARK", "So your team coordinates with ARK") },
  };
}
