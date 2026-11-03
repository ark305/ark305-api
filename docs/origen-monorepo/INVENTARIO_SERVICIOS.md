# Inventario inicial de servicios de ARK305

**La app es un MVP sin proveedores confirmados. Desarrollaremos la base técnica y los contratos de integración sin exigir oferta operativa; la validación comercial será necesaria antes de prestar servicios reales.**

Estado: inventario técnico inicial, pendiente de validación comercial. No acredita proveedores disponibles, precios vigentes ni servicios activos. Seguimiento: [fase 1](../odd/tasks/fase-1-fundamentos.md).

## 1. Qué existe en el código

| Área | Inventario observado | Estado y siguiente validación |
|---|---|---|
| Experiencias | 18 servicios y 4 paquetes | Datos estáticos del prototipo. Confirmar proveedor, alcance, precio y disponibilidad. |
| Talento | 138 posiciones: 61 presenciales y 77 remotas, en 16 categorías | Los candidatos mostrados son ejemplos; confirmar profesionales reales y contratación. |
| ARK Private | 6 residencias y 12 servicios | El archivo declara ficticios precios y datos inmobiliarios; validar toda oferta antes de publicarla como real. |
| Comunidad | 10 cursos, 3 plantillas de equipos, 1 paquete interno, 5 grupos y 3 eventos | Contenido de muestra; confirmar autores, responsables, acceso y calendario. |
| Herramientas Business | Equipos, reventa, cotizaciones, contratos, facturas e informes | Son herramientas de operación, no proveedores adicionales. Algunos estados comerciales se simulan localmente. |

Fuentes: [experiencias](../src/lib/catalog.ts), [talento](../src/lib/talent.ts), [Private](../src/lib/private.ts), [comunidad](../src/lib/community.ts), [reventa](../src/lib/resale-store.ts) y [documentos](../src/components/docs-view.tsx).

Las áreas se solapan: una posición de talento puede representar un servicio ya incluido en experiencias. **No deben sumarse como si fueran ofertas comerciales únicas.** La aplicación también tiene código de perfiles y servicios con Supabase; este inventario no sustituye una auditoría de esa integración.

## 2. Experiencias: las 18 entradas actuales

Las unidades siguientes son las del prototipo. No se trasladan sus importes a una lista comercial aprobada.

| ID | Servicio | Unidad actual | Información operativa por confirmar |
|---|---|---|---|
| `suv` | SUV con chofer | Hora | Flota, zona, mínimos y disponibilidad. |
| `airport` | Traslado aeropuerto | Fija | Ruta, capacidad, equipaje y política de espera. |
| `heli` | Helicóptero | Hora | Operador, ruta, capacidad y condiciones de salida. |
| `yacht` | Yate 50 ft | Hora | Embarcación, tripulación, extras y confirmación. |
| `catamaran` | Catamarán al atardecer | Hora | Salida, capacidad y condiciones de cancelación. |
| `jetski` | Jet ski | Hora | Operador, requisitos del participante y disponibilidad. |
| `chef` | Chef privado | Persona | Menú, comensales, restricciones alimentarias y materiales. |
| `brunch` | Brunch a domicilio | Persona | Menú, montaje, zona y mínimos. |
| `bottles` | Delivery de botellas | Fija | Productos, entrega y validaciones aplicables. |
| `restaurant` | Mesa en restaurante | Fija | Establecimiento, confirmación y qué cubre la tarifa. |
| `vipTable` | Mesa VIP en club | Fija | Local, acceso, consumos y condiciones. |
| `turnover` | Recambio Airbnb | Fija | Inmueble, tareas, horario y evidencia de entrega. |
| `villa` | Preparar la villa | Fija | Alcance, compras, acceso al inmueble y aprobación. |
| `photographer` | Fotógrafo | Hora | Duración, entregables, derechos de uso y entrega. |
| `drone` | Video con drone | Hora | Localización, condiciones de operación y entregables. |
| `reel` | Reel para redes | Fija | Guion, grabación, revisiones y plazo. |
| `shoot` | Grabación ClipKitchen | Hora | Sesión, equipo y entrega de material sin editar. |
| `edit30` | Edición: 30 videos | Mensual | Material de entrada, calendario y revisiones. |

Paquetes existentes: día en el agua, noche en Miami, desde el aire y host de Airbnb. Su operación depende de confirmar cada servicio incluido; no tienen disponibilidad garantizada por estar agrupados.

## 3. Talento y Private: cómo abordarlos

**Talento presencial:** transporte; marina; chef y noche; hogar y hosts; contenido en Miami; remodelación y oficios; técnicos a domicilio.

**Talento remoto:** contenido y medios; marketing y crecimiento; ventas y atención; operaciones y administración; tecnología; finanzas y legal; estrategia y liderazgo; educación y bienestar; estilo de vida y lujo.

El siguiente paso no es crear 138 flujos independientes: primero hay que acordar qué posiciones comparten contratación por hora, proyecto o mensualidad y cuáles requieren cotización específica.

**Private:** preconstrucción y patrimonio, obra y diseño, y vida privada. Sus residencias, aviación, grandes embarcaciones, seguridad y personal requieren validar oferta y operación por separado. No convertir sus datos de demostración en promesas al cliente.

## 4. Ficha que completaremos para el piloto

| Campo | Estado actual |
|---|---|
| Servicio y cliente objetivo | Pendiente de elección del usuario. |
| Proveedor confirmado y responsable de ARK | Diferido hasta integrar proveedores; no bloquea el MVP técnico. |
| Qué incluye y qué excluye | Pendiente de validación. |
| Precio fijo, por unidad o cotización | Pendiente; no asumir que el prototipo es vigente. |
| Fuente de disponibilidad y plazo de confirmación | Pendiente de definición. |
| Datos mínimos que debe aportar el cliente | Pendiente según servicio; evitar recopilar información innecesaria. |
| Solicitud, aprobación y seguimiento | Pendiente; confirmación humana es una propuesta, no una decisión tomada. |
| Cobro, cancelación y reembolso | Pendiente de reglas comerciales. |
| Entrega, incidencias y responsable de soporte | Pendiente de definición. |
| Evidencia de finalización | Pendiente según el servicio. |

## 5. Qué podemos avanzar y qué requiere decisión

- **Avanzado:** inventario técnico y separación entre oferta, contenido y herramientas.
- **No completado:** validación comercial de las fichas y elección del piloto.
- **Siguiente trabajo técnico:** comprobar la base y especificar contratos de catálogo, solicitudes e integración, sin depender de proveedores confirmados.
- **IA:** las pruebas reales de Meta siguen pendientes de la API key; no bloquean la definición comercial.

**Criterio para el MVP:** elegir un recorrido representativo que permita probar contratos y persistencia. Una integración no configurada debe informar ese estado, nunca inventar disponibilidad, precio confirmado ni reserva aceptada.

## 6. Dirección técnica acordada

- NestJS independiente para el backend y Next.js para la web de pruebas, según la decisión posterior del usuario. La futura aplicación móvil consumirá la misma API HTTP. La base local ya existe en [backend/](../backend/README.md); la migración de negocio continúa pendiente.
- Reglas de negocio y casos de uso fuera de componentes React y de los archivos de rutas. Las rutas adaptan HTTP al caso de uso, no contienen toda la operación.
- Las Server Actions existentes pueden mantenerse como adaptadores web, pero no serán el único acceso a funciones que deba consumir el móvil. Los adaptadores comparten los mismos casos de uso.
- Contratos de proveedores separados de sus implementaciones concretas. Definir capacidades según cada servicio; no asumir que todos permiten cotizar, reservar o cancelar automáticamente.
- Adaptador no conectado explícito en el MVP; dobles de prueba controlados para verificar escenarios. No presentar resultados simulados como transacciones reales.
- Validación, permisos, estados y cálculos definitivos en servidor. El frontend mantiene formularios, presentación, interacción y validación de ayuda al usuario.
- API de cliente versionada y contratos de error/autenticación definidos antes de integrarla con móvil. La interfaz interna de un proveedor no es la misma que el contrato público de la API.
- Mantener una aplicación modular inicialmente; no añadir microservicios ni elegir framework móvil todavía. Procesos largos o integraciones asíncronas se evaluarán por necesidad, no se asumirán cubiertos por una petición HTTP.

Propuesta de flujo: web/móvil → API HTTP → casos de uso y dominio → persistencia / adaptadores externos.

Referencia: [Next.js como capa HTTP de backend](https://nextjs.org/docs/app/guides/backend-for-frontend). Es una dirección arquitectónica; todavía no está implementada ni validada en ejecución.
