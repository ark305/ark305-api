export type Service = { id: string; name: { es: string; en: string }; description: { es: string; en: string }; unit: 'h' | 'p' | 'f' | 'm'; outing: boolean };

// Intentionally contains only model-facing catalog facts; pricing and provider data stay out of the prompt.
export const SERVICES: Service[] = [
  { id: 'suv', name: { es: 'SUV con chofer', en: 'SUV with driver' }, description: { es: 'Escalade o similar, chofer bilingüe.', en: 'Escalade or similar, bilingual driver.' }, unit: 'h', outing: false },
  { id: 'airport', name: { es: 'Traslado aeropuerto', en: 'Airport transfer' }, description: { es: 'MIA o FLL, con recepción en llegadas.', en: 'MIA or FLL, with meet & greet.' }, unit: 'f', outing: false },
  { id: 'heli', name: { es: 'Helicóptero', en: 'Helicopter' }, description: { es: 'Tour por South Beach o traslado a los Keys.', en: 'South Beach tour or a transfer to the Keys.' }, unit: 'h', outing: true },
  { id: 'yacht', name: { es: 'Yate 50 ft', en: '50 ft yacht' }, description: { es: 'Sandbar, Star Island y Biscayne Bay.', en: 'Sandbar, Star Island and Biscayne Bay.' }, unit: 'h', outing: true },
  { id: 'catamaran', name: { es: 'Catamarán al atardecer', en: 'Sunset catamaran' }, description: { es: 'Navegación tranquila, perfecta para parejas.', en: 'A calm sail, perfect for couples.' }, unit: 'h', outing: true },
  { id: 'jetski', name: { es: 'Jet ski', en: 'Jet ski' }, description: { es: 'Salida desde Miami Beach Marina.', en: 'Departs from Miami Beach Marina.' }, unit: 'h', outing: true },
  { id: 'chef', name: { es: 'Chef privado', en: 'Private chef' }, description: { es: 'Menú de 4 tiempos en tu casa o a bordo.', en: 'A 4-course menu at home or on board.' }, unit: 'p', outing: false },
  { id: 'brunch', name: { es: 'Brunch a domicilio', en: 'Brunch at home' }, description: { es: 'Montaje completo para grupo.', en: 'Full setup for your group.' }, unit: 'p', outing: false },
  { id: 'bottles', name: { es: 'Delivery de botellas', en: 'Bottle delivery' }, description: { es: 'Champagne, tequila y hielo al yate o la villa.', en: 'Champagne, tequila and ice to the yacht or villa.' }, unit: 'f', outing: false },
  { id: 'restaurant', name: { es: 'Mesa en restaurante', en: 'Restaurant table' }, description: { es: 'Reserva en lugares difíciles de conseguir.', en: 'Bookings at hard-to-get spots.' }, unit: 'f', outing: true },
  { id: 'vipTable', name: { es: 'Mesa VIP en club', en: 'VIP club table' }, description: { es: 'Acceso y mesa con host.', en: 'Entry and a table with a host.' }, unit: 'f', outing: true },
  { id: 'turnover', name: { es: 'Recambio Airbnb', en: 'Airbnb turnover' }, description: { es: 'Limpieza, ropa de cama y reporte con fotos.', en: 'Cleaning, linens and a photo report.' }, unit: 'f', outing: false },
  { id: 'villa', name: { es: 'Preparar la villa', en: 'Villa prep' }, description: { es: 'Flores, compras y ambiente antes de llegar.', en: 'Flowers, groceries and ambiance before you arrive.' }, unit: 'f', outing: false },
  { id: 'photographer', name: { es: 'Fotógrafo', en: 'Photographer' }, description: { es: 'Sesión en yate, calle o evento.', en: 'A shoot on a yacht, street or event.' }, unit: 'h', outing: false },
  { id: 'drone', name: { es: 'Video con drone', en: 'Drone video' }, description: { es: 'Tomas aéreas con piloto licenciado.', en: 'Aerial shots with a licensed pilot.' }, unit: 'h', outing: false },
  { id: 'reel', name: { es: 'Reel para redes', en: 'Social reel' }, description: { es: 'Grabación y edición de un reel vertical.', en: 'Filming and editing a vertical reel.' }, unit: 'f', outing: false },
  { id: 'shoot', name: { es: 'Grabación ClipKitchen', en: 'ClipKitchen shoot' }, description: { es: 'Sesión presencial, material sin editar.', en: 'In-person session, raw footage.' }, unit: 'h', outing: false },
  { id: 'edit30', name: { es: 'Edición: 30 videos', en: 'Editing: 30 videos' }, description: { es: 'Un mes de contenido a partir de tu material.', en: 'A month of content from your footage.' }, unit: 'm', outing: false },
];

export function findService(id: unknown) { return typeof id === 'string' ? SERVICES.find(service => service.id === id) : undefined; }
