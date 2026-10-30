import { CatalogService } from './catalog.port';

// Snapshot of prototype descriptions; not confirmed supplier offerings.
export const demoServices: CatalogService[] = [
  {
    id: "suv", category: "transport",
    name: {"es":"SUV con chofer","en":"SUV with driver"},
    description: {"es":"Escalade o similar, chofer bilingüe.","en":"Escalade or similar, bilingual driver."},
    pricing: { type: 'quote' }, source: 'demo', bookable: false,
  },
  {
    id: "airport", category: "transport",
    name: {"es":"Traslado aeropuerto","en":"Airport transfer"},
    description: {"es":"MIA o FLL, con recepción en llegadas.","en":"MIA or FLL, with meet & greet."},
    pricing: { type: 'quote' }, source: 'demo', bookable: false,
  },
  {
    id: "heli", category: "transport",
    name: {"es":"Helicóptero","en":"Helicopter"},
    description: {"es":"Tour por South Beach o traslado a los Keys.","en":"South Beach tour or a transfer to the Keys."},
    pricing: { type: 'quote' }, source: 'demo', bookable: false,
  },
  {
    id: "yacht", category: "water",
    name: {"es":"Yate 50 ft","en":"50 ft yacht"},
    description: {"es":"Sandbar, Star Island y Biscayne Bay.","en":"Sandbar, Star Island and Biscayne Bay."},
    pricing: { type: 'quote' }, source: 'demo', bookable: false,
  },
  {
    id: "catamaran", category: "water",
    name: {"es":"Catamarán al atardecer","en":"Sunset catamaran"},
    description: {"es":"Navegación tranquila, perfecta para parejas.","en":"A calm sail, perfect for couples."},
    pricing: { type: 'quote' }, source: 'demo', bookable: false,
  },
  {
    id: "jetski", category: "water",
    name: {"es":"Jet ski","en":"Jet ski"},
    description: {"es":"Salida desde Miami Beach Marina.","en":"Departs from Miami Beach Marina."},
    pricing: { type: 'quote' }, source: 'demo', bookable: false,
  },
  {
    id: "chef", category: "dining",
    name: {"es":"Chef privado","en":"Private chef"},
    description: {"es":"Menú de 4 tiempos en tu casa o a bordo.","en":"A 4-course menu at home or on board."},
    pricing: { type: 'quote' }, source: 'demo', bookable: false,
  },
  {
    id: "brunch", category: "dining",
    name: {"es":"Brunch a domicilio","en":"Brunch at home"},
    description: {"es":"Montaje completo para grupo.","en":"Full setup for your group."},
    pricing: { type: 'quote' }, source: 'demo', bookable: false,
  },
  {
    id: "bottles", category: "dining",
    name: {"es":"Delivery de botellas","en":"Bottle delivery"},
    description: {"es":"Champagne, tequila y hielo al yate o la villa.","en":"Champagne, tequila and ice to the yacht or villa."},
    pricing: { type: 'quote' }, source: 'demo', bookable: false,
  },
  {
    id: "restaurant", category: "dining",
    name: {"es":"Mesa en restaurante","en":"Restaurant table"},
    description: {"es":"Reserva en lugares difíciles de conseguir.","en":"Bookings at hard-to-get spots."},
    pricing: { type: 'quote' }, source: 'demo', bookable: false,
  },
  {
    id: "vipTable", category: "nightlife",
    name: {"es":"Mesa VIP en club","en":"VIP club table"},
    description: {"es":"Acceso y mesa con host.","en":"Entry and a table with a host."},
    pricing: { type: 'quote' }, source: 'demo', bookable: false,
  },
  {
    id: "turnover", category: "home",
    name: {"es":"Recambio Airbnb","en":"Airbnb turnover"},
    description: {"es":"Limpieza, ropa de cama y reporte con fotos.","en":"Cleaning, linens and a photo report."},
    pricing: { type: 'quote' }, source: 'demo', bookable: false,
  },
  {
    id: "villa", category: "home",
    name: {"es":"Preparar la villa","en":"Villa prep"},
    description: {"es":"Flores, compras y ambiente antes de llegar.","en":"Flowers, groceries and ambiance before you arrive."},
    pricing: { type: 'quote' }, source: 'demo', bookable: false,
  },
  {
    id: "photographer", category: "content",
    name: {"es":"Fotógrafo","en":"Photographer"},
    description: {"es":"Sesión en yate, calle o evento.","en":"A shoot on a yacht, street or event."},
    pricing: { type: 'quote' }, source: 'demo', bookable: false,
  },
  {
    id: "drone", category: "content",
    name: {"es":"Video con drone","en":"Drone video"},
    description: {"es":"Tomas aéreas con piloto licenciado.","en":"Aerial shots with a licensed pilot."},
    pricing: { type: 'quote' }, source: 'demo', bookable: false,
  },
  {
    id: "reel", category: "content",
    name: {"es":"Reel para redes","en":"Social reel"},
    description: {"es":"Grabación y edición de un reel vertical.","en":"Filming and editing of a vertical reel."},
    pricing: { type: 'quote' }, source: 'demo', bookable: false,
  },
  {
    id: "shoot", category: "content",
    name: {"es":"Grabación ClipKitchen","en":"ClipKitchen shoot"},
    description: {"es":"Sesión presencial, material sin editar.","en":"In-person session, raw footage."},
    pricing: { type: 'quote' }, source: 'demo', bookable: false,
  },
  {
    id: "edit30", category: "content",
    name: {"es":"Edición: 30 videos","en":"Editing: 30 videos"},
    description: {"es":"Un mes de contenido a partir de tu material.","en":"A month of content from your footage."},
    pricing: { type: 'quote' }, source: 'demo', bookable: false,
  },
];
