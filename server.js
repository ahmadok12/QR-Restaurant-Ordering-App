const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(DATA_DIR, 'pos_db.json');

function getLocalIpAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

if (!fs.existsSync(path.dirname(DB_FILE))) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
}

// Token signing secret: use AUTH_SECRET if set, otherwise a random secret persisted
// next to the database (never committed) so tokens survive restarts.
function loadAuthSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const secretFile = path.join(path.dirname(DB_FILE), '.auth_secret');
  try {
    if (fs.existsSync(secretFile)) {
      const existing = fs.readFileSync(secretFile, 'utf8').trim();
      if (existing.length >= 32) return existing;
    }
    const generated = crypto.randomBytes(48).toString('base64url');
    fs.writeFileSync(secretFile, generated, { encoding: 'utf8', mode: 0o600 });
    return generated;
  } catch (e) {
    console.warn('Could not persist auth secret, using an in-memory one (tokens reset on restart):', e.message);
    return crypto.randomBytes(48).toString('base64url');
  }
}
const AUTH_SECRET = loadAuthSecret();

// --- PASSWORD & PIN HASHING (scrypt, no dependencies) ---
const HASH_PREFIX = 'scrypt$';

function hashSecret(plain) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(String(plain), salt, 32).toString('base64url');
  return `${HASH_PREFIX}${salt}$${hash}`;
}

function isHashed(value) {
  return typeof value === 'string' && value.startsWith(HASH_PREFIX);
}

function verifySecret(plain, stored) {
  if (!stored || plain === undefined || plain === null || plain === '') return false;
  if (!isHashed(stored)) {
    // Legacy plaintext value (migrated to a hash on startup)
    const a = Buffer.from(String(plain));
    const b = Buffer.from(String(stored));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const [, salt, hash] = stored.split('$');
  const expected = Buffer.from(hash, 'base64url');
  const actual = crypto.scryptSync(String(plain), salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function generatePin() {
  return String(crypto.randomInt(100000, 1000000));
}

const DEFAULT_THEME = {
  vibePreset: "heritage",
  primaryColor: "#ac2d00",
  primaryColorRgb: "172 45 0",
  primaryContainer: "#d53e0b",
  accentColor: "#f59e0b",
  surfaceColor: "#ffffff",
  backgroundColor: "#f8f9ff",
  fontHeadline: "Outfit",
  fontBody: "DM Sans",
  coverBanner: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
  logoUrl: "",
  tagline: "Authentic Gourmet Dining • Handcrafted Daily",
  welcomeMessage: "Welcome to Dera! Enjoy chef-curated live kitchen specialties & traditional tastes."
};

function hexToRgbString(hex) {
  if (!hex) return '172 45 0';
  let c = String(hex).replace('#', '').trim();
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  if (c.length !== 6) return '172 45 0';
  const num = parseInt(c, 16);
  if (isNaN(num)) return '172 45 0';
  return `${(num >> 16) & 255} ${(num >> 8) & 255} ${num & 255}`;
}

const DEFAULT_DB = {
  superAdmin: {
    email: "superadmin@deragourmet.com",
    password: "SuperAdmin#2026",
    name: "Master Super Admin"
  },
  auditLogs: [],
  shifts: [],
  restaurants: [
    {
      id: "rest-dera-01",
      name: "Dera Gourmet",
      address: "74-B Gulberg III, Main Boulevard, Lahore",
      ownerName: "Malik Tariq",
      ownerPhone: "+92 300 8472910",
      ownerManagesApp: true,
      managerName: "Aslam Khan",
      managerPhone: "+92 300 9988112",
      managerPin: "7788",
      nextInvoiceNumber: 1001,
      plan: "trial",
      planLabel: "Free Trial (15 Days)",
      trialDays: 15,
      status: "active",
      subscriptionCancelled: false,
      startDate: new Date(Date.now() - 2 * 86400000).toISOString(),
      endDate: new Date(Date.now() + 13 * 86400000).toISOString(),
      credentials: {
        email: "owner@deragourmet.com",
        password: "DeraAdmin#2026"
      },
      currency: "Rs.",
      taxRate: 0.05,
      theme: { ...DEFAULT_THEME }
    }
  ],
  staff: [
    {
      id: "waiter-01",
      restaurantId: "rest-dera-01",
      name: "Hamza Abbasi",
      phone: "+92 321 4455667",
      email: "hamza@deragourmet.com",
      password: "Waiter#101",
      role: "waiter",
      hierarchyLevel: 1,
      maxConcurrentOrders: 4,
      status: "active"
    },
    {
      id: "waiter-02",
      restaurantId: "rest-dera-01",
      name: "Bilal Farooq",
      phone: "+92 333 7788990",
      email: "bilal@deragourmet.com",
      password: "Waiter#102",
      role: "waiter",
      hierarchyLevel: 2,
      maxConcurrentOrders: 4,
      status: "active"
    },
    {
      id: "waiter-03",
      restaurantId: "rest-dera-01",
      name: "Usman Raza",
      phone: "+92 345 1122334",
      email: "usman@deragourmet.com",
      password: "Waiter#103",
      role: "waiter",
      hierarchyLevel: 3,
      maxConcurrentOrders: 5,
      status: "active"
    },
    {
      id: "cashier-01",
      restaurantId: "rest-dera-01",
      name: "Rashid Minhas",
      phone: "+92 301 9988776",
      email: "cashier@deragourmet.com",
      password: "Cashier#2026",
      role: "cashier",
      status: "active"
    }
  ],
  tickets: [
    {
      ticketId: '#TKT-1042',
      restaurantId: 'rest-dera-01',
      table: 'Table 04',
      guest: 'Tariq M.',
      time: '12:14 PM',
      timestamp: Date.now() - (12 * 60 * 1000),
      notes: 'Serve with hot green chilies & ginger',
      payment: 'Pay Cash at Table',
      paymentStatus: 'unpaid',
      status: 'In Kitchen',
      assignedWaiterId: 'waiter-01',
      assignedWaiterName: 'Hamza Abbasi (Rank 1)',
      items: [
        { title: 'Chicken Makhni Karahi', qty: 1, size: 'Half (0.5 kg)', spice: 'Chatpata 🌶️', station: 'karahi', price: 1250 },
        { title: 'Sesame Roghni Naan', qty: 3, size: 'Single Naan', spice: 'Normal 🍃', station: 'rice_naan', price: 140 }
      ],
      subtotal: 1670,
      tax: 84,
      total: 1754
    },
    {
      ticketId: '#TKT-1043',
      restaurantId: 'rest-dera-01',
      table: 'Table 02',
      guest: 'Zainab B.',
      time: '12:22 PM',
      timestamp: Date.now() - (4 * 60 * 1000),
      notes: 'Extra mint raita',
      payment: 'Pay at Front Cashier',
      paymentStatus: 'unpaid',
      status: 'Plated & Ready',
      assignedWaiterId: 'waiter-02',
      assignedWaiterName: 'Bilal Farooq (Rank 2)',
      items: [
        { title: 'Reshmi Chicken Malai Boti', qty: 1, size: 'Single Plate (8 pcs)', spice: 'Normal 🍃', station: 'bbq', price: 780 },
        { title: 'Special Chicken Dum Biryani', qty: 1, size: 'Single Plate', spice: 'Chatpata 🌶️', station: 'rice_naan', price: 690 },
        { title: 'Kulhad Makhni Sweet Lassi', qty: 2, size: 'Standard Kulhad', spice: 'Sweet', station: 'drinks_meetha', price: 290 }
      ],
      subtotal: 1680,
      tax: 80,
      total: 1760
    }
  ],
  sections: [
    "Patio Corner", "Window Booth", "Main Hall", "Center Floor", "Mezzanine", "Bar High-top", "VIP Lounge", "Patio Garden"
  ],
  tables: [
    { id: '01', name: 'Table 01', zone: 'Patio Corner', capacity: 4, shape: 'round', x: 12, y: 15, status: 'vacant', order: null },
    { id: '02', name: 'Table 02', zone: 'Window Booth', capacity: 4, shape: 'booth', x: 38, y: 15, status: 'dining', order: {
      ticketId: '#TKT-1043', guest: 'Zainab B.', time: '12:22 PM', total: 1760, subtotal: 1680, payment: 'Pay at Front Cashier',
      items: [{ title: 'Reshmi Chicken Malai Boti', qty: 1, price: 780 }, { title: 'Special Chicken Dum Biryani', qty: 1, price: 690 }, { title: 'Kulhad Makhni Sweet Lassi', qty: 2, price: 290 }]
    }},
    { id: '03', name: 'Table 03', zone: 'Main Hall', capacity: 4, shape: 'square', x: 64, y: 15, status: 'vacant', order: null },
    { id: '04', name: 'Table 04', zone: 'Main Hall', capacity: 6, shape: 'rect', x: 88, y: 15, status: 'dining', order: {
      ticketId: '#TKT-1042', guest: 'Tariq M.', time: '12:14 PM', total: 1754, subtotal: 1670, payment: 'Pay Cash at Table',
      items: [{ title: 'Chicken Makhni Karahi', qty: 1, price: 1250 }, { title: 'Sesame Roghni Naan', qty: 3, price: 140 }]
    }},
    { id: '05', name: 'Table 05', zone: 'Center Floor', capacity: 4, shape: 'round', x: 12, y: 48, status: 'vacant', order: null },
    { id: '06', name: 'Table 06', zone: 'Mezzanine', capacity: 2, shape: 'square', x: 38, y: 48, status: 'vacant', order: null },
    { id: '07', name: 'Table 07', zone: 'Bar High-top', capacity: 2, shape: 'round', x: 64, y: 48, status: 'vacant', order: null },
    { id: '08', name: 'Table 08', zone: 'VIP Lounge', capacity: 8, shape: 'rect', x: 88, y: 48, status: 'vacant', order: null },
    { id: '09', name: 'Table 09', zone: 'Patio Garden', capacity: 4, shape: 'round', x: 12, y: 80, status: 'vacant', order: null },
    { id: '10', name: 'Table 10', zone: 'Patio Garden', capacity: 4, shape: 'round', x: 38, y: 80, status: 'vacant', order: null },
    { id: '11', name: 'Table 11', zone: 'Window Booth', capacity: 4, shape: 'booth', x: 64, y: 80, status: 'vacant', order: null },
    { id: '12', name: 'Table 12', zone: 'VIP Lounge', capacity: 6, shape: 'booth', x: 88, y: 80, status: 'vacant', order: null }
  ],
  serviceBells: [
    { id: 'B-1', table: 'Table 04', request: '💧 Chilled Mineral Water', time: '12:35 PM' }
  ],
  sales: [
    {
      id: 'SALE-101',
      ticketId: '#TKT-1039',
      table: 'Table 01',
      subtotal: 2450,
      tax: 120,
      total: 2570,
      paymentMethod: 'Cash',
      cashReceived: 3000,
      changeGiven: 430,
      cashierName: 'Rashid Minhas',
      time: '11:45 AM',
      timestamp: Date.now() - (75 * 60 * 1000)
    }
  ],
  soldOut: [],
  menu: []
};

const DEFAULT_MENU = [
  {
    id: "dish-1",
    restaurantId: "REST-001",
    title: "Chicken Makhni Karahi",
    category: "karahi",
    station: "karahi",
    price: 1250,
    rating: 4.9,
    prepTime: "20-25 min",
    calories: "680 kcal",
    dietary: "Desi Makhan & Tomatoes",
    isSpicy: true,
    isChef: true,
    desc: "Fresh tender chicken simmered in a traditional clay handi with ripe Sindh tomatoes, freshly pounded ginger juliennes, green chilies, and authentic Desi Makhan.",
    image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80",
    status: "available",
    sizeOptions: [
      { name: "Half (0.5 kg)", extra: 0, desc: "Serves 1-2 persons" },
      { name: "Full (1.0 kg)", extra: 1100, desc: "Serves 3-4 persons" }
    ]
  },
  {
    id: "dish-2",
    restaurantId: "REST-001",
    title: "Mutton Shinwari Karahi",
    category: "karahi",
    station: "karahi",
    price: 1850,
    rating: 5.0,
    prepTime: "30-35 min",
    calories: "790 kcal",
    dietary: "KPK Tribal Special",
    isSpicy: false,
    isChef: true,
    desc: "Pure Peshawari Shinwari style fresh young mutton cooked in its own natural fat, coarse sea salt, black pepper, and whole tomatoes. No onions.",
    image: "https://images.unsplash.com/photo-1545247181-516773cae754?auto=format&fit=crop&w=800&q=80",
    status: "available",
    sizeOptions: [
      { name: "Half (0.5 kg)", extra: 0, desc: "Serves 1-2 persons" },
      { name: "Full (1.0 kg)", extra: 1650, desc: "Serves 3-4 persons" }
    ]
  },
  {
    id: "dish-3",
    restaurantId: "REST-001",
    title: "Special Chicken Dum Biryani",
    category: "rice",
    station: "rice_naan",
    price: 690,
    rating: 4.9,
    prepTime: "10-15 min",
    calories: "720 kcal",
    dietary: "Karachi Dum Special",
    isSpicy: true,
    isChef: true,
    desc: "Long-grain aged Basmati rice layered with succulent marinated chicken, saffron milk, caramelized brown onions, golden potato, and aromatic kewra.",
    image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80",
    status: "available",
    sizeOptions: [
      { name: "Single Plate", extra: 0, desc: "1 Chicken piece & Aloo" },
      { name: "Double Special", extra: 560, desc: "2 Chicken pieces & Double Rice" }
    ]
  },
  {
    id: "dish-4",
    restaurantId: "REST-001",
    title: "Reshmi Chicken Malai Boti",
    category: "bbq",
    station: "bbq",
    price: 780,
    rating: 4.8,
    prepTime: "18-20 min",
    calories: "520 kcal",
    dietary: "Melt-in-mouth Creamy Skewers",
    isSpicy: false,
    isChef: true,
    desc: "Boneless chicken cubes steeped in velvety cream, strained yogurt, cardamom, white pepper, and roasted coriander, char-grilled over fragrant coals.",
    image: "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=800&q=80",
    status: "available",
    sizeOptions: [
      { name: "Single Plate (8 pcs)", extra: 0, desc: "Serves 1 person" },
      { name: "Family Platter (16 pcs)", extra: 720, desc: "Serves 2-3 persons" }
    ]
  },
  {
    id: "dish-5",
    restaurantId: "REST-001",
    title: "Peshawari Beef Chapli Kabab",
    category: "bbq",
    station: "bbq",
    price: 650,
    rating: 4.9,
    prepTime: "15-18 min",
    calories: "610 kcal",
    dietary: "Crispy Crust with Pomegranate",
    isSpicy: true,
    isChef: false,
    desc: "Traditional flat minced beef patties kneaded with crushed anardana, coriander seeds, fresh mint, scrambled egg, and tomato slice, shallow fried in bone marrow ghee.",
    image: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80",
    status: "available",
    sizeOptions: [
      { name: "Standard (2 Kababs)", extra: 0, desc: "Served with mint chutney" },
      { name: "Large (4 Kababs)", extra: 600, desc: "Served with 2 Naan" }
    ]
  },
  {
    id: "dish-6",
    restaurantId: "REST-001",
    title: "Sesame Roghni Naan",
    category: "naan",
    station: "rice_naan",
    price: 140,
    rating: 4.7,
    prepTime: "5-8 min",
    calories: "280 kcal",
    dietary: "Fresh Tandoor Baked",
    isSpicy: false,
    isChef: false,
    desc: "Pillowy tandoor-baked leavened flatbread brushed with golden desi butter and sprinkled with toasted white sesame seeds.",
    image: "https://images.unsplash.com/photo-1626074353765-517a681e40be?auto=format&fit=crop&w=800&q=80",
    status: "available",
    sizeOptions: [
      { name: "Single Naan", extra: 0, desc: "1 piece" },
      { name: "Basket of 3", extra: 260, desc: "3 pieces hot & fresh" }
    ]
  },
  {
    id: "dish-7",
    restaurantId: "REST-001",
    title: "Kulhad Makhni Sweet Lassi",
    category: "drinks",
    station: "drinks_meetha",
    price: 290,
    rating: 4.9,
    prepTime: "5 min",
    calories: "340 kcal",
    dietary: "Thick Hand-Churned Yogurt",
    isSpicy: false,
    isChef: true,
    desc: "Authentic chilled Punjabi lassi served in an earthen clay kulhad, crowned with a thick dollop of fresh milk malai, pistachio slivers, and saffron syrup.",
    image: "https://images.unsplash.com/photo-1571006687694-7a557729a788?auto=format&fit=crop&w=800&q=80",
    status: "available",
    sizeOptions: [
      { name: "Standard Kulhad", extra: 0, desc: "350 ml" },
      { name: "Jumbo Kulhad", extra: 160, desc: "500 ml" }
    ]
  },
  {
    id: "dish-8",
    restaurantId: "REST-001",
    title: "Shahi Gulab Jamun",
    category: "desserts",
    station: "drinks_meetha",
    price: 320,
    rating: 4.9,
    prepTime: "5 min",
    calories: "390 kcal",
    dietary: "Desi Ghee Fried",
    isSpicy: false,
    isChef: false,
    desc: "Warm melt-in-mouth milk solid dumplings fried in pure desi ghee, soaked in rose cardamom sugar syrup, and dusted with silver leaf.",
    image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=800&q=80",
    status: "available",
    sizeOptions: [
      { name: "2 Pieces", extra: 0, desc: "Served hot" },
      { name: "4 Pieces", extra: 280, desc: "With Rabri" }
    ]
  }
];

const DEFAULT_CATEGORIES = [
  { id: "deals", name: "Deals & Combos", icon: "local_offer", description: "Value bundles, party combos & saver meals" },
  { id: "pizzas", name: "Artisan Pizzas", icon: "local_pizza", description: "Hand-tossed crust, rich mozzarella & premium toppings" },
  { id: "burgers", name: "Gourmet Burgers", icon: "lunch_dining", description: "Crispy fried chicken & juicy smash beef burgers" },
  { id: "sandwiches", name: "Toasted Sandwiches", icon: "breakfast_dining", description: "Triple-decker clubs, Philly steaks & grilled paninis" },
  { id: "wraps", name: "Signature Wraps", icon: "restaurant", description: "Tortilla rolls packed with crunchy chicken & sauces" },
  { id: "drinks", name: "Drinks & Shakes", icon: "local_cafe", description: "Chilled sodas, mint margaritas & thick milkshakes" },
  { id: "desserts", name: "Desserts & Sweets", icon: "icecream", description: "Molten lava cake, cheesecake, churros & waffles" }
];

const DEFAULT_SIDES = [
  { id: "side-1", name: "Garlic Mayo Dip", price: 60, isAvailable: true, description: "Creamy garlic dipping sauce" },
  { id: "side-2", name: "Extra Mozzarella Cheese", price: 200, isAvailable: true, description: "Rich melted 100% mozzarella" },
  { id: "side-3", name: "Spicy Peri Peri Dip", price: 70, isAvailable: true, description: "Zesty Portuguese fiery mayo" },
  { id: "side-4", name: "Cheddar Cheese Slice", price: 80, isAvailable: true, description: "Melted American cheddar slice" },
  { id: "side-5", name: "Curly Fries Side", price: 220, isAvailable: true, description: "Seasoned crispy spiral fries" },
  { id: "side-6", name: "Onion Rings (6 pcs)", price: 220, isAvailable: true, description: "Crispy battered golden onion rings" },
  { id: "side-7", name: "Warm Nutella Dip", price: 90, isAvailable: true, description: "Warm hazelnut chocolate dip" }
];

const DEFAULT_TAGS = [
  { id: "tag-chef", name: "Chef's Special", icon: "hotel_class", color: "amber" },
  { id: "tag-spicy", name: "Spicy Flag", icon: "local_fire_department", color: "red" },
  { id: "tag-bestseller", name: "Best Seller", icon: "trending_up", color: "orange" },
  { id: "tag-veg", name: "Vegetarian", icon: "eco", color: "emerald" }
];

const DEFAULT_EXTRAS = [
  { id: "extra-1", name: "Roghni Naan", fullName: "Sesame Roghni Naan", price: 140, icon: "🫓", station: "rice_naan", isAvailable: true, description: "Clay oven tandoor sesame naan" },
  { id: "extra-2", name: "Garlic Naan", fullName: "Garlic Butter Naan", price: 160, icon: "🧄", station: "rice_naan", isAvailable: true, description: "Garlic & desi makhan naan" },
  { id: "extra-3", name: "Mineral Water", fullName: "Chilled Mineral Water", price: 90, icon: "💧", station: "drinks_meetha", isAvailable: true, description: "Chilled 500ml mineral water" },
  { id: "extra-4", name: "Raita & Salad", fullName: "Fresh Raita & Salad", price: 120, icon: "🥣", station: "rice_naan", isAvailable: true, description: "Whipped zeera raita & green salad" },
  { id: "extra-5", name: "Sweet Lassi", fullName: "Kulhad Makhni Sweet Lassi", price: 290, icon: "🥛", station: "drinks_meetha", isAvailable: true, description: "Rich yogurt churned lassi" },
  { id: "extra-6", name: "Mint Cooler", fullName: "Peshawari Mint Margarita", price: 260, icon: "🍋", station: "drinks_meetha", isAvailable: true, description: "Chilled mint cooler with lemon" },
  { id: "extra-7", name: "Matka Chai", fullName: "Doodh Patti Karak Matka Chai", price: 180, icon: "☕", station: "drinks_meetha", isAvailable: true, description: "Strong cardamom clay pot tea" },
  { id: "extra-8", name: "Gulab Jamun", fullName: "Shahi Gulab Jamun (2 pcs)", price: 220, icon: "🍨", station: "drinks_meetha", isAvailable: true, description: "Warm syrup-soaked desi meetha" }
];

const DEFAULT_WAITER_RANKS = [
  { id: "rank-1", name: "Senior Waiter", ranking: 1, restaurantId: "REST-001" },
  { id: "rank-2", name: "Junior Waiter", ranking: 2, restaurantId: "REST-001" },
  { id: "rank-3", name: "Trainee", ranking: 3, restaurantId: "REST-001" }
];

const DEFAULT_WAITER_SERVICES = [
  { id: "ws-1", name: "Call Server / Waiter", icon: "notifications_active", price: 0, category: "service", description: "Request waiter assistance at table", isAvailable: true },
  { id: "ws-2", name: "Bring Water", icon: "water_drop", price: 0, category: "service", description: "Drinking water glasses / refill", isAvailable: true },
  { id: "ws-3", name: "Tissue Paper / Napkins", icon: "dry_cleaning", price: 0, category: "service", description: "Extra napkins and wet wipes", isAvailable: true },
  { id: "ws-4", name: "Extra Cutlery & Plates", icon: "flatware", price: 0, category: "service", description: "Extra spoons, forks, knives & plates", isAvailable: true },
  { id: "ws-5", name: "Clear / Clean Table", icon: "cleaning_services", price: 0, category: "service", description: "Clear used plates and clean table", isAvailable: true },
  { id: "ws-6", name: "Bring Bill (Cash / Card)", icon: "receipt_long", price: 0, category: "service", description: "Request invoice / bill payment", isAvailable: true },
  { id: "ws-7", name: "Chilled Mineral Water", icon: "water_drop", price: 90, category: "item", station: "drinks_meetha", description: "500ml chilled mineral water", isAvailable: true },
  { id: "ws-8", name: "Hot Roti / Naan", icon: "bakery_dining", price: 140, category: "item", station: "rice_naan", description: "Fresh clay oven tandoor naan", isAvailable: true },
  { id: "ws-9", name: "Fresh Zeera Raita", icon: "soup_kitchen", price: 80, category: "item", station: "rice_naan", description: "Whipped spiced yogurt bowl", isAvailable: true },
  { id: "ws-10", name: "Doodh Patti Karak Chai", icon: "coffee", price: 180, category: "item", station: "drinks_meetha", description: "Strong cardamom matka tea", isAvailable: true }
];

DEFAULT_DB.menu = DEFAULT_MENU;
DEFAULT_DB.categories = DEFAULT_CATEGORIES;
DEFAULT_DB.sides = DEFAULT_SIDES;
DEFAULT_DB.tags = DEFAULT_TAGS;
DEFAULT_DB.extras = DEFAULT_EXTRAS;
DEFAULT_DB.waiterRanks = DEFAULT_WAITER_RANKS;
DEFAULT_DB.waiterServices = DEFAULT_WAITER_SERVICES;

function readDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (!data.restaurants || data.restaurants.length === 0) {
        data.restaurants = DEFAULT_DB.restaurants;
      }
      if (!data.staff || data.staff.length === 0) {
        data.staff = DEFAULT_DB.staff;
      }
      if (!data.menu || data.menu.length === 0) {
        data.menu = DEFAULT_MENU;
      }
      if (!data.categories || data.categories.length === 0) {
        data.categories = DEFAULT_CATEGORIES;
      }
      if (!data.sides || data.sides.length === 0) {
        data.sides = DEFAULT_SIDES;
      }
      if (!data.tags || data.tags.length === 0) {
        data.tags = DEFAULT_TAGS;
      }
      if (!data.extras || data.extras.length === 0) {
        data.extras = DEFAULT_EXTRAS;
      }
      if (!data.waiterRanks || data.waiterRanks.length === 0) {
        data.waiterRanks = DEFAULT_WAITER_RANKS;
      }
      if (!data.waiterServices || data.waiterServices.length === 0) {
        data.waiterServices = DEFAULT_WAITER_SERVICES;
      }
      if (!data.auditLogs) data.auditLogs = [];
      if (!data.shifts) data.shifts = [];
      if (!data.superAdmin) data.superAdmin = DEFAULT_DB.superAdmin;
      (data.restaurants || []).forEach(r => {
        if (!r.nextInvoiceNumber) r.nextInvoiceNumber = 1001;
      });
      return data;
    }
  } catch (e) {
    console.error('Failed to read db file:', e);
  }
  return DEFAULT_DB;
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write db file:', e);
  }
}

if (!fs.existsSync(DB_FILE)) {
  writeDb(DEFAULT_DB);
}
{
  const current = readDb();
  let updated = false;
  if (!current.restaurants || current.restaurants.length === 0) { current.restaurants = DEFAULT_DB.restaurants; updated = true; }
  if (!current.staff || current.staff.length === 0) { current.staff = DEFAULT_DB.staff; updated = true; }
  if (!current.menu || current.menu.length === 0) { current.menu = DEFAULT_MENU; updated = true; }
  if (!current.categories || current.categories.length === 0) { current.categories = DEFAULT_CATEGORIES; updated = true; }
  if (!current.sides || current.sides.length === 0) { current.sides = DEFAULT_SIDES; updated = true; }
  if (!current.tags || current.tags.length === 0) { current.tags = DEFAULT_TAGS; updated = true; }
  if (!current.extras || current.extras.length === 0) { current.extras = DEFAULT_EXTRAS; updated = true; }
  if (!current.waiterRanks || current.waiterRanks.length === 0) { current.waiterRanks = DEFAULT_WAITER_RANKS; updated = true; }
  if (!current.waiterServices || current.waiterServices.length === 0) { current.waiterServices = DEFAULT_WAITER_SERVICES; updated = true; }
  if (!current.auditLogs) { current.auditLogs = []; updated = true; }
  if (!current.shifts) { current.shifts = []; updated = true; }
  if (!current.superAdmin) { current.superAdmin = DEFAULT_DB.superAdmin; updated = true; }
  (current.restaurants || []).forEach(r => {
    if (!r.managerPin) {
      const pin = generatePin();
      console.log(`Generated manager PIN for ${r.id} (${r.name}): ${pin}  (shown once, store it safely)`);
      r.managerPin = pin;
      updated = true;
    }
    if (!r.nextInvoiceNumber) { r.nextInvoiceNumber = 1001; updated = true; }
    if (!r.theme) { r.theme = { ...DEFAULT_THEME }; updated = true; }
  });

  // Migrate any plaintext passwords and PINs to scrypt hashes
  if (current.superAdmin && current.superAdmin.password && !isHashed(current.superAdmin.password)) {
    current.superAdmin.password = hashSecret(current.superAdmin.password);
    updated = true;
  }
  (current.restaurants || []).forEach(r => {
    if (r.credentials && r.credentials.password && !isHashed(r.credentials.password)) {
      r.credentials.password = hashSecret(r.credentials.password);
      updated = true;
    }
    if (r.managerPin && !isHashed(r.managerPin)) {
      r.managerPin = hashSecret(r.managerPin);
      updated = true;
    }
  });
  (current.staff || []).forEach(st => {
    if (st.password && !isHashed(st.password)) {
      st.password = hashSecret(st.password);
      updated = true;
    }
  });
  if (current.managerPin) { delete current.managerPin; updated = true; }
  // Every table QR carries a secret so a guessed table number can't order
  (current.tables || []).forEach(t => {
    if (!t.qrToken) { t.qrToken = generateTableToken(); updated = true; }
  });
  if (updated) writeDb(current);
}

// --- AUDIT & SECURITY ENGINES ---
function generateAuthToken(user) {
  const payload = {
    userId: user.id || user.email,
    role: user.role,
    name: user.name,
    restaurantId: user.restaurantId || 'rest-dera-01',
    issuedAt: Date.now()
  };
  const str = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(str).digest('base64url');
  return `${str}.${sig}`;
}

function verifyAuthToken(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [str, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(str).digest('base64url');
    if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      const payload = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
      if (Date.now() - payload.issuedAt > 24 * 3600 * 1000) return null;
      return payload;
    }
  } catch (e) {}
  return null;
}

function getRequestAuth(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    return verifyAuthToken(authHeader.substring(7).trim());
  }
  return null;
}

const ADMIN_ROLES = ['restaurant_admin', 'super_admin'];
const STAFF_ROLES = ['waiter', 'cashier', 'restaurant_admin', 'super_admin'];

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Returns the verified token payload, or sends 401/403 and returns null.
function requireRole(req, res, roles) {
  const auth = getRequestAuth(req);
  if (!auth) {
    sendJson(res, 401, { error: 'Login required.' });
    return null;
  }
  if (!roles.includes(auth.role)) {
    sendJson(res, 403, { error: 'You do not have permission to do this.' });
    return null;
  }
  return auth;
}

// The demo restaurant historically used both 'rest-dera-01' and 'REST-001'.
function canonicalRestId(id) {
  return id === 'rest-dera-01' ? 'REST-001' : id;
}

// Super admins can act on any restaurant; everyone else only on their own.
function canAccessRestaurant(auth, restId) {
  if (!auth) return false;
  if (auth.role === 'super_admin') return true;
  if (!restId) return true;
  return canonicalRestId(auth.restaurantId) === canonicalRestId(restId);
}

function denyOtherRestaurant(res) {
  sendJson(res, 403, { error: 'This belongs to a different restaurant.' });
}

// Strip secrets before anything leaves the server.
function publicStaff(staff) {
  if (!staff) return staff;
  const { password, ...rest } = staff;
  return rest;
}

function publicRestaurant(rest) {
  if (!rest) return rest;
  const { managerPin, credentials, ...copy } = rest;
  if (credentials) copy.credentials = { email: credentials.email };
  return copy;
}

// Table info safe for anyone: no QR secret, no session device ids.
function publicTable(t) {
  if (!t) return t;
  const { qrToken, session, ...rest } = t;
  return rest;
}

// Staff view of a table: QR secret only for admins, never the host's device id.
function staffTable(t, auth) {
  if (!t) return t;
  const isAdmin = auth && ADMIN_ROLES.includes(auth.role);
  const { qrToken, session, ...rest } = t;
  if (isAdmin) rest.qrToken = qrToken;
  if (session) {
    const { hostDeviceId, ...sessionRest } = session;
    rest.session = sessionRest;
  }
  return rest;
}

function publicDb(db, auth) {
  const copy = { ...db };
  copy.tables = (db.tables || []).map(t => staffTable(t, auth));
  delete copy.superAdmin;
  delete copy.managerPin;
  copy.restaurants = (db.restaurants || []).map(publicRestaurant);
  copy.staff = (db.staff || []).map(publicStaff);
  return copy;
}

// Guest-typed text is shown on staff screens; strip characters that could inject HTML or script.
function cleanText(value, maxLength = 300) {
  if (value === undefined || value === null) return value;
  return String(value).replace(/[<>"'`\\]/g, '').slice(0, maxLength);
}

function cleanGuestFields(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  (fields || Object.keys(obj)).forEach(key => {
    if (typeof obj[key] === 'string') obj[key] = cleanText(obj[key]);
  });
  return obj;
}

// Manager PIN brute-force protection: 5 wrong PINs locks voids for that restaurant for 15 minutes.
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;
const pinFailures = new Map();

function isPinLocked(restId) {
  const entry = pinFailures.get(restId);
  return Boolean(entry && entry.lockedUntil && entry.lockedUntil > Date.now());
}

function recordPinFailure(restId) {
  const entry = pinFailures.get(restId) || { count: 0, lockedUntil: 0 };
  if (entry.lockedUntil && entry.lockedUntil <= Date.now()) {
    entry.count = 0;
    entry.lockedUntil = 0;
  }
  entry.count += 1;
  if (entry.count >= PIN_MAX_ATTEMPTS) entry.lockedUntil = Date.now() + PIN_LOCK_MS;
  pinFailures.set(restId, entry);
}

function clearPinFailures(restId) {
  pinFailures.delete(restId);
}

// Login brute-force protection: 10 failed logins per identifier per 15 minutes.
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginFailures = new Map();

function isLoginLocked(key) {
  const entry = loginFailures.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > LOGIN_WINDOW_MS) {
    loginFailures.delete(key);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordLoginFailure(key) {
  const entry = loginFailures.get(key);
  if (!entry || Date.now() - entry.firstAt > LOGIN_WINDOW_MS) {
    loginFailures.set(key, { count: 1, firstAt: Date.now() });
  } else {
    entry.count += 1;
  }
}

function logAuditEvent(db, action, details, actor = 'system', restaurantId = 'rest-dera-01') {
  if (!db.auditLogs) db.auditLogs = [];
  const actorName = typeof actor === 'object' ? (actor.name || actor.email || actor.role || 'user') : String(actor);
  const entry = {
    id: 'AUDIT-' + Date.now() + '-' + Math.floor(100 + Math.random() * 900),
    action: action,
    details: details,
    actor: actorName,
    restaurantId: restaurantId,
    timestamp: Date.now(),
    isoTime: new Date().toISOString()
  };
  db.auditLogs.unshift(entry);
  if (db.auditLogs.length > 2000) db.auditLogs.pop();
  return entry;
}

// Fixed-price combo deals hardcoded in the customer menu (index.html addComboFeast)
const BUILTIN_COMBOS = [
  { id: 'deal-1', title: 'Deal 1: Solo Crunch Fiesta', price: 799, station: 'fastfood' },
  { id: 'deal-2', title: 'Deal 2: Duo Pizza & Wings Feast', price: 1799, station: 'fastfood' },
  { id: 'deal-3', title: 'Deal 3: Family Mega Party Combo', price: 2999, station: 'fastfood' },
  { id: '101', title: 'Dera Karahi Feast (Family)', price: 3450, station: 'karahi' },
  { id: '102', title: 'BBQ & Biryani Platter (Duo)', price: 2150, station: 'bbq' }
];

// Everything a guest can legitimately order for a restaurant, with server-side prices.
function buildOrderCatalog(db, restId) {
  const restKey = canonicalRestId(restId);
  const ownMenu = (Array.isArray(db.menu) ? db.menu : [])
    .filter(d => !d.restaurantId || canonicalRestId(d.restaurantId) === restKey);
  const defaultMenu = (Array.isArray(DEFAULT_MENU) ? DEFAULT_MENU : [])
    .filter(d => !d.restaurantId || canonicalRestId(d.restaurantId) === restKey);
  const extras = (db.extras || DEFAULT_EXTRAS || []).map(x => ({
    id: x.id, title: x.fullName || x.name, altTitle: x.name, price: Number(x.price) || 0, station: x.station || 'rice_naan'
  }));
  const sides = (db.sides || DEFAULT_SIDES || []).map(x => ({
    id: x.id, title: x.name, price: Number(x.price) || 0, station: x.station || 'rice_naan'
  }));
  const services = (db.waiterServices || DEFAULT_WAITER_SERVICES || [])
    .filter(x => Number(x.price) > 0)
    .map(x => ({ id: x.id, title: x.name, price: Number(x.price) || 0, station: x.station || 'rice_naan' }));
  return [...ownMenu, ...defaultMenu, ...BUILTIN_COMBOS, ...extras, ...sides, ...services];
}

function findCatalogItem(catalog, item) {
  const wantId = item.dishId !== undefined && item.dishId !== null ? String(item.dishId) : null;
  const wantTitle = item.title ? String(item.title).toLowerCase().trim() : null;
  return catalog.find(d => wantId !== null && String(d.id) === wantId) ||
    catalog.find(d => wantTitle && (
      (d.title && d.title.toLowerCase().trim() === wantTitle) ||
      (d.altTitle && d.altTitle.toLowerCase().trim() === wantTitle)
    ));
}

// strict: reject items that are not on this restaurant's menu (used for new guest orders).
// Non-strict keeps the stored price for items no longer on the menu (used when settling).
function calculateAuthoritativeOrder(order, db, targetRestId, options = {}) {
  const restId = targetRestId || order.restaurantId || 'rest-dera-01';
  const rest = (db.restaurants || []).find(r => r.id === restId || (restId === 'REST-001' && r.id === 'rest-dera-01') || (restId === 'rest-dera-01' && r.id === 'REST-001')) || (db.restaurants && db.restaurants[0]) || {};

  const catalog = buildOrderCatalog(db, rest.id || restId);
  let subtotal = 0;

  if (options.strict) {
    const unknown = (order.items || []).filter(item => !findCatalogItem(catalog, item));
    if (unknown.length > 0) {
      const err = new Error(`Item not on the menu: ${unknown.map(i => i.title || i.dishId).join(', ')}`);
      err.statusCode = 400;
      throw err;
    }
  }

  const authoritativeItems = (order.items || []).map(item => {
    const canonical = findCatalogItem(catalog, item);

    let unitPrice = canonical ? canonical.price : Math.max(0, Number(item.price) || 0);

    if (canonical && canonical.sizeOptions && Array.isArray(canonical.sizeOptions) && item.size) {
      const sizeOpt = canonical.sizeOptions.find(s => s.name === item.size);
      if (sizeOpt && !isNaN(Number(sizeOpt.price))) {
        unitPrice = Number(sizeOpt.price);
      }
    }

    let addonSum = 0;
    const addonsList = item.selectedAddons || (Array.isArray(item.addons) ? item.addons.map(a => (typeof a === 'string' ? a : (a && a.name))) : null);
    if (addonsList && Array.isArray(addonsList) && canonical && canonical.addons) {
      addonsList.forEach(addonName => {
        const canonicalAddon = canonical.addons.find(a => a.name === addonName);
        if (canonicalAddon) addonSum += Number(canonicalAddon.price) || 0;
      });
    }

    const finalItemPrice = unitPrice + addonSum;
    const qty = Math.max(1, parseInt(item.qty, 10) || 1);
    subtotal += (finalItemPrice * qty);

    return {
      dishId: canonical ? canonical.id : (item.dishId || 'custom'),
      title: canonical ? canonical.title : (item.title || 'Custom Dish'),
      price: finalItemPrice,
      qty: qty,
      size: cleanText(item.size || 'Standard Portion', 100),
      spice: cleanText(item.spice || 'Normal 🍃', 100),
      station: canonical ? canonical.station : cleanText(item.station || 'karahi', 50),
      notes: cleanText(item.notes || item.note || '')
    };
  });

  const totals = computeCharges(rest, subtotal);

  return {
    items: authoritativeItems,
    subtotal: subtotal,
    tax: totals.tax,
    serviceCharge: totals.serviceCharge,
    charges: totals.charges,
    total: subtotal + totals.chargesTotal
  };
}

// Applies a restaurant's enabled taxes and charges to a subtotal.
function computeCharges(rest, subtotal) {
  const taxRate = Number(rest && rest.taxRate) || 0.05;
  const billingCharges = (rest && Array.isArray(rest.billingCharges) && rest.billingCharges.length > 0)
    ? rest.billingCharges
    : [
        { id: 'chg-tax-default', name: 'Sales Tax (PRA)', type: 'percentage', rate: Math.round(taxRate * 100) || 5, enabled: true, category: 'tax' }
      ];

  let appliedCharges = [];
  let totalChargesAmount = 0;
  let taxSum = 0;
  let serviceSum = 0;

  billingCharges.forEach(charge => {
    if (charge.enabled !== false) {
      let amount = 0;
      if (charge.type === 'percentage') {
        const ratePct = Number(charge.rate !== undefined ? charge.rate : charge.amount) || 0;
        amount = Math.round((subtotal * ratePct) / 100);
      } else {
        // fixed flat amount (only when something was ordered)
        amount = subtotal > 0 ? Math.round(Number(charge.rate !== undefined ? charge.rate : charge.amount) || 0) : 0;
      }
      
      const chgName = String(charge.name || '').toLowerCase();
      const chgCat = charge.category || (chgName.includes('service') ? 'service' : 'tax');
      if (chgCat === 'tax' || chgName.includes('tax') || chgName.includes('pra') || chgName.includes('gst')) {
        taxSum += amount;
      } else if (chgCat === 'service' || chgName.includes('service')) {
        serviceSum += amount;
      }

      totalChargesAmount += amount;
      appliedCharges.push({
        id: charge.id,
        name: charge.name,
        type: charge.type,
        rate: Number(charge.rate !== undefined ? charge.rate : charge.amount) || 0,
        amount: amount,
        category: chgCat
      });
    }
  });

  return { charges: appliedCharges, tax: taxSum, serviceCharge: serviceSum, chargesTotal: totalChargesAmount };
}

// ==========================================
// ORDER CONTROLS ENGINE
// Guests propose orders; the server owns tickets. Each submission becomes an
// immutable "round" that waits for the waiter to confirm it (unless the
// restaurant turns that off). Only confirmed, non-voided lines are billed.
// ==========================================
const ORDER_LIMITS = {
  maxQtyPerLine: 20,
  maxLinesPerRound: 30,
  minMsBetweenRounds: 5000
};
const KITCHEN_FLOW = ['New', 'In Kitchen', 'Plated & Ready', 'Served'];
const CLOSED_STATUSES = ['Settled', 'Voided', 'Rejected'];
const ONLINE_TABLE = 'Online Order';
const lastRoundByDevice = new Map();

function findRestaurant(db, restId) {
  const key = canonicalRestId(restId || 'REST-001');
  return (db.restaurants || []).find(r => canonicalRestId(r.id) === key) || null;
}

function getOrderSettings(rest) {
  const s = (rest && rest.orderSettings) || {};
  return {
    requireWaiterConfirm: s.requireWaiterConfirm !== false,
    requireTableOpen: s.requireTableOpen === true,
    orderingPaused: s.orderingPaused === true,
    pausedMessage: s.pausedMessage || 'Ordering is paused right now. Please ask a member of staff.',
    onlineOrdering: s.onlineOrdering !== false
  };
}

function tableNumberFrom(raw) {
  return String(raw || '').replace(/^Table\s+/i, '').trim().padStart(2, '0');
}

function findTable(db, raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const rawStr = String(raw).trim();
  const tNum = tableNumberFrom(rawStr);
  const tableStr = `Table ${tNum}`;
  return (db.tables || []).find(t =>
    t.id === tNum || t.id === rawStr || (t.name && t.name.toLowerCase() === tableStr.toLowerCase())
  ) || null;
}

function generateTableToken() {
  return crypto.randomBytes(9).toString('base64url');
}

function newTicketId() {
  return '#TKT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function newRoundId() {
  return 'rnd_' + crypto.randomBytes(5).toString('hex');
}

function newLineId() {
  return 'ln_' + crypto.randomBytes(5).toString('hex');
}

function tokensMatch(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// Returns an error message when a guest may not use this table, else null.
function tableAccessError(tbl, token) {
  if (!tbl) return 'This table is not on the floor plan. Please ask a member of staff.';
  if (tbl.qrToken && !tokensMatch(token, tbl.qrToken)) {
    return 'This QR code is no longer valid. Please scan the code on your table or ask staff.';
  }
  return null;
}

function isTicketOpen(ticket) {
  return Boolean(ticket) && !CLOSED_STATUSES.includes(ticket.status);
}

function findTicket(db, ticketId) {
  return (db.tickets || []).find(t => t.ticketId === ticketId) || null;
}

function findOpenTicketForTable(db, tbl) {
  if (!tbl) return null;
  const tableNames = [tbl.name, `Table ${tbl.id}`].filter(Boolean).map(n => n.toLowerCase());
  if (tbl.order && tbl.order.ticketId) {
    const t = findTicket(db, tbl.order.ticketId);
    if (isTicketOpen(t)) return t;
  }
  return (db.tickets || []).find(t => isTicketOpen(t) && t.table && tableNames.includes(String(t.table).toLowerCase())) || null;
}

function isDishSoldOut(db, dish) {
  if (!dish) return false;
  if (dish.isAvailable === false) return true;
  if (['sold_out', 'unavailable', 'soldout'].includes(String(dish.status || '').toLowerCase())) return true;
  const soldOut = Array.isArray(db.soldOut) ? db.soldOut.map(String) : [];
  return soldOut.includes(String(dish.id)) || (dish.title && soldOut.includes(dish.title));
}

function lineKey(line) {
  return [line.dishId, line.size || '', line.spice || '', line.notes || ''].map(String).join('|');
}

// Everything already on the ticket (confirmed, pending or voided) counts as "already ordered".
function existingQuantities(ticket) {
  const counts = new Map();
  const add = l => counts.set(lineKey(l), (counts.get(lineKey(l)) || 0) + (Number(l.qty) || 0));
  (ticket.items || []).forEach(add);
  (ticket.pendingRounds || []).forEach(r => (r.items || []).forEach(add));
  return counts;
}

// The customer page re-sends the whole ticket each round. Keep only what is new,
// so a re-send can add dishes but can never remove or shrink existing lines.
function newLinesOnly(ticket, pricedLines) {
  const remaining = existingQuantities(ticket);
  const added = [];
  pricedLines.forEach(line => {
    const key = lineKey(line);
    const already = remaining.get(key) || 0;
    const used = Math.min(already, line.qty);
    remaining.set(key, already - used);
    if (line.qty - used > 0) added.push({ ...line, qty: line.qty - used });
  });
  return added;
}

function validateRoundLines(db, catalogLines) {
  if (catalogLines.length === 0) return 'Your order is empty.';
  if (catalogLines.length > ORDER_LIMITS.maxLinesPerRound) {
    return `Too many different dishes in one order (max ${ORDER_LIMITS.maxLinesPerRound}). Please send in parts.`;
  }
  const tooMany = catalogLines.find(l => l.qty > ORDER_LIMITS.maxQtyPerLine);
  if (tooMany) {
    return `Maximum ${ORDER_LIMITS.maxQtyPerLine} of one dish per order (${tooMany.title}). Please ask staff for large orders.`;
  }
  return null;
}

// Recompute bill totals from confirmed, non-voided lines at their locked prices.
function recomputeTicketTotals(ticket, db) {
  const rest = findRestaurant(db, ticket.restaurantId) || {};
  const billable = (ticket.items || []).filter(l => !l.voided);
  const subtotal = billable.reduce((sum, l) => sum + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
  const totals = computeCharges(rest, subtotal);
  ticket.subtotal = subtotal;
  ticket.tax = totals.tax;
  ticket.serviceCharge = totals.serviceCharge;
  ticket.charges = totals.charges;
  ticket.total = subtotal + totals.chargesTotal;
  ticket.pendingTotal = (ticket.pendingRounds || []).reduce((sum, r) =>
    sum + (r.items || []).reduce((s2, l) => s2 + (Number(l.price) || 0) * (Number(l.qty) || 0), 0), 0);
  return ticket;
}

function addTicketNotice(ticket, text) {
  if (!ticket.notices) ticket.notices = [];
  ticket.notices.push({ id: 'ntc_' + crypto.randomBytes(4).toString('hex'), at: Date.now(), text: cleanText(text, 200) });
  if (ticket.notices.length > 50) ticket.notices.shift();
}

// The table's cached copy of its ticket, used by floor views and guest polling.
function syncTableOrder(db, ticket) {
  const tbl = ticket.tableId ? (db.tables || []).find(t => t.id === ticket.tableId) : findTable(db, ticket.table);
  if (!tbl) return;
  if (!isTicketOpen(ticket)) {
    if (tbl.order && tbl.order.ticketId === ticket.ticketId) {
      tbl.order = null;
      tbl.status = 'vacant';
      tbl.session = null;
      const rest = findRestaurant(db, ticket.restaurantId);
      if (getOrderSettings(rest).requireTableOpen) tbl.openForOrders = false;
    }
    return;
  }
  tbl.status = 'dining';
  tbl.order = guestTicketView(ticket);
}

// What a guest at the table may see about their own ticket.
function guestTicketView(ticket) {
  return {
    ticketId: ticket.ticketId,
    table: ticket.table,
    guest: ticket.guest,
    time: ticket.time,
    status: ticket.status,
    payment: ticket.payment,
    assignedWaiter: ticket.assignedWaiterName,
    items: ticket.items || [],
    pendingItems: (ticket.pendingRounds || []).flatMap(r => (r.items || []).map(l => ({ ...l, pending: true }))),
    subtotal: ticket.subtotal,
    tax: ticket.tax,
    serviceCharge: ticket.serviceCharge,
    charges: ticket.charges,
    total: ticket.total,
    pendingTotal: ticket.pendingTotal || 0,
    notices: ticket.notices || [],
    billRequested: Boolean(ticket.billRequested),
    invoiceNumber: ticket.invoiceNumber || null
  };
}

function staffActorName(auth) {
  return auth ? (auth.name || auth.role) : 'Staff';
}

function confirmRound(db, ticket, round, auth, edits) {
  let lines = (round.items || []).map(l => ({ ...l }));
  const changes = [];
  if (Array.isArray(edits)) {
    // Waiters may lower quantities or drop lines before confirming, never add or raise.
    lines = lines.map(l => {
      const edit = edits.find(e => e.lineId === l.lineId);
      if (!edit) return l;
      const qty = Math.max(0, Math.min(l.qty, parseInt(edit.qty, 10)));
      if (Number.isNaN(qty)) return l;
      if (qty !== l.qty) changes.push(`${l.title}: ${l.qty} → ${qty}`);
      return { ...l, qty };
    }).filter(l => l.qty > 0);
  }
  ticket.pendingRounds = (ticket.pendingRounds || []).filter(r => r.roundId !== round.roundId);
  const confirmedAt = Date.now();
  lines.forEach(l => {
    l.confirmedAt = confirmedAt;
    l.confirmedBy = staffActorName(auth);
  });
  if (!ticket.items) ticket.items = [];
  ticket.items.push(...lines);
  if (!ticket.rounds) ticket.rounds = [];
  ticket.rounds.push({
    roundId: round.roundId, round: round.round, status: 'Confirmed', createdAt: round.createdAt,
    confirmedAt, confirmedBy: staffActorName(auth), edits: changes
  });

  if (lines.length > 0 && ['Pending', 'Plated & Ready', 'Served'].includes(ticket.status)) {
    ticket.status = 'New';
  }
  if (lines.length === 0 && (ticket.items || []).length === 0 && (ticket.pendingRounds || []).length === 0) {
    ticket.status = 'Rejected';
  }
  recomputeTicketTotals(ticket, db);
  addTicketNotice(ticket, changes.length
    ? `Your order was confirmed with changes (${changes.join(', ')}).`
    : 'Your order was confirmed and sent to the kitchen.');
  logAuditEvent(db, 'ORDER_ROUND_CONFIRMED', {
    ticketId: ticket.ticketId, table: ticket.table, round: round.round,
    lines: lines.length, edits: changes, staffId: auth ? auth.userId : null
  }, staffActorName(auth), ticket.restaurantId);
  return lines;
}

// Creates or extends a ticket from a guest's (or staff member's) order.
// Returns { status, body } for the HTTP response.
function placeOrder(db, eventData, auth) {
  const order = eventData.order || {};
  const isStaff = Boolean(auth && STAFF_ROLES.includes(auth.role));
  const restId = canonicalRestId((isStaff && auth.role !== 'super_admin' ? auth.restaurantId : order.restaurantId) || 'REST-001');
  const rest = findRestaurant(db, restId);
  if (!rest) return { status: 404, body: { error: 'Restaurant not found.' } };
  if (rest.status === 'cancelled' || rest.subscriptionCancelled) {
    return { status: 403, body: { error: 'This restaurant is not taking orders.' } };
  }
  const settings = getOrderSettings(rest);
  if (settings.orderingPaused && !isStaff) {
    return { status: 423, body: { error: settings.pausedMessage, orderingPaused: true } };
  }

  const deviceId = cleanText(String(eventData.senderDeviceId || order.senderDeviceId || '').trim(), 80);
  if (!isStaff && !deviceId) return { status: 400, body: { error: 'Missing device id. Please reload the page.' } };

  // Rate limit per phone
  if (!isStaff) {
    const last = lastRoundByDevice.get(deviceId) || 0;
    if (Date.now() - last < ORDER_LIMITS.minMsBetweenRounds) {
      return { status: 429, body: { error: 'Please wait a few seconds before sending again.' } };
    }
  }

  const rawTable = String(order.table || eventData.table || '').trim();
  const isOnline = rawTable.toLowerCase() === ONLINE_TABLE.toLowerCase();
  let tbl = null;
  let ticket = null;

  if (isOnline) {
    if (!settings.onlineOrdering) return { status: 403, body: { error: 'Online ordering is turned off.' } };
    const prior = order.ticketId ? findTicket(db, order.ticketId) : null;
    if (prior && isTicketOpen(prior) && prior.isOnline && prior.ownerDeviceId === deviceId) ticket = prior;
  } else {
    tbl = findTable(db, rawTable);
    if (!isStaff) {
      const accessError = tableAccessError(tbl, eventData.tableToken || order.tableToken);
      if (accessError) return { status: 403, body: { error: accessError, invalidTable: true } };
    } else if (!tbl) {
      return { status: 404, body: { error: 'Table not found.' } };
    }
    ticket = findOpenTicketForTable(db, tbl);

    if (!isStaff && settings.requireTableOpen && !ticket && !tbl.openForOrders) {
      return { status: 423, body: { error: 'This table has not been opened yet. Please ask your waiter.', tableClosed: true } };
    }
    // Only the table host can send the first order
    if (!isStaff && !ticket && tbl.session && tbl.session.hostDeviceId && deviceId !== tbl.session.hostDeviceId) {
      return {
        status: 403,
        body: {
          error: `Only the Table Host (${tbl.session.hostName || 'Table Lead'}) can submit the initial order. Dishes remain in the shared cart for the Host to fire.`,
          isHost: false,
          hostName: tbl.session.hostName
        }
      };
    }
  }

  // Price every line from the menu; unknown dishes are rejected
  let priced;
  try {
    priced = calculateAuthoritativeOrder({ items: order.items || [] }, db, restId, { strict: true });
  } catch (err) {
    return { status: err.statusCode || 400, body: { error: err.message } };
  }
  const catalog = buildOrderCatalog(db, restId);
  const soldOut = priced.items.filter(l => isDishSoldOut(db, catalog.find(d => String(d.id) === String(l.dishId))));
  if (soldOut.length > 0) {
    return { status: 409, body: { error: `Sorry, sold out: ${soldOut.map(l => l.title).join(', ')}.`, soldOut: soldOut.map(l => l.dishId) } };
  }

  const isNewTicket = !ticket;
  // order.newItemsOnly: the client sent just this round's dishes (current customer page).
  // Otherwise it re-sent the whole ticket, so keep only what is new.
  const lines = (isNewTicket || order.newItemsOnly === true) ? priced.items : newLinesOnly(ticket, priced.items);
  const limitError = validateRoundLines(db, lines);
  if (limitError) {
    if (!isNewTicket && lines.length === 0) {
      return { status: 200, body: { ok: true, order: guestTicketView(ticket), nothingNew: true } };
    }
    return { status: 400, body: { error: limitError } };
  }

  if (isNewTicket) {
    const assigned = autoAssignWaiter(db, restId);
    ticket = {
      ticketId: newTicketId(),
      restaurantId: restId,
      table: isOnline ? ONLINE_TABLE : (tbl.name || `Table ${tbl.id}`),
      tableId: tbl ? tbl.id : null,
      isOnline: isOnline,
      ownerDeviceId: deviceId || null,
      guest: cleanText(order.guest || (tbl ? `${tbl.name} Guest` : 'Online Guest'), 60),
      notes: cleanText(order.notes || ''),
      payment: cleanText(order.payment || 'Pay Cash to Server at Table', 60),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      status: 'Pending',
      items: [],
      pendingRounds: [],
      rounds: [],
      notices: [],
      assignedWaiterId: assigned.id,
      assignedWaiterName: assigned.name
    };
    if (!db.tickets) db.tickets = [];
    db.tickets.unshift(ticket);
  } else if (order.notes) {
    const extra = cleanText(order.notes);
    if (extra && !String(ticket.notes || '').includes(extra)) {
      ticket.notes = (ticket.notes ? ticket.notes + ' | ' : '') + extra;
    }
  }

  const roundNo = (ticket.rounds || []).length + (ticket.pendingRounds || []).length + 1;
  const round = {
    roundId: newRoundId(),
    round: roundNo,
    createdAt: Date.now(),
    source: isStaff ? 'staff' : 'guest',
    deviceId: deviceId || null,
    items: lines.map(l => ({ ...l, lineId: newLineId(), round: roundNo, addedAt: Date.now() }))
  };
  if (!ticket.pendingRounds) ticket.pendingRounds = [];
  ticket.pendingRounds.push(round);

  // Large orders always need a waiter, even when confirmation is turned off
  const roundQty = round.items.reduce((s, l) => s + l.qty, 0);
  const needsConfirm = settings.requireWaiterConfirm || roundQty > 10;
  if (isStaff || !needsConfirm) {
    confirmRound(db, ticket, round, isStaff ? auth : { name: 'Auto-confirmed', role: 'system' }, null);
  } else {
    recomputeTicketTotals(ticket, db);
    addTicketNotice(ticket, `Order round ${roundNo} sent. Your waiter will confirm it shortly.`);
  }

  if (tbl && tbl.session) tbl.session.draftCart = [];
  if (!isStaff) lastRoundByDevice.set(deviceId, Date.now());
  syncTableOrder(db, ticket);

  logAuditEvent(db, isNewTicket ? 'ORDER_CREATED' : 'ORDER_ROUND_ADDED', {
    ticketId: ticket.ticketId,
    table: ticket.table,
    round: roundNo,
    lines: round.items.length,
    roundValue: round.items.reduce((s, l) => s + l.price * l.qty, 0),
    needsConfirmation: !isStaff && needsConfirm,
    assignedWaiter: ticket.assignedWaiterName
  }, isStaff ? staffActorName(auth) : (ticket.guest || 'Customer'), ticket.restaurantId);

  return { status: 200, body: { ok: true, order: guestTicketView(ticket), ticket } };
}

// Kitchen and floor status moves. Settled, Voided and Rejected only come from
// their own endpoints, and statuses only move forward.
function changeTicketStatus(db, ticketId, newStatus, auth) {
  if (!auth || !STAFF_ROLES.includes(auth.role)) return { status: 403, body: { error: 'Staff login required.' } };
  const ticket = findTicket(db, ticketId);
  if (!ticket) return { status: 404, body: { error: 'Order not found.' } };
  if (!canAccessRestaurant(auth, ticket.restaurantId)) return { status: 403, body: { error: 'This belongs to a different restaurant.' } };
  const target = String(newStatus || '');
  if (!KITCHEN_FLOW.includes(target)) {
    return { status: 400, body: { error: 'Status can only be New, In Kitchen, Plated & Ready or Served. Payment, voids and rejections have their own steps.' } };
  }
  const from = KITCHEN_FLOW.indexOf(ticket.status);
  if (from === -1) {
    return { status: 409, body: { error: ticket.status === 'Pending'
      ? 'This order is waiting for the waiter to confirm it.'
      : `This order is ${ticket.status}; its status can no longer change.` } };
  }
  const to = KITCHEN_FLOW.indexOf(target);
  if (to <= from) return { status: 409, body: { error: `This order is already ${ticket.status}.` } };

  const previous = ticket.status;
  ticket.status = target;
  if (!ticket.statusHistory) ticket.statusHistory = [];
  ticket.statusHistory.push({ from: previous, to: target, by: staffActorName(auth), staffId: auth.userId, at: Date.now() });
  if (target === 'Plated & Ready') addTicketNotice(ticket, 'Your food is ready and on its way.');
  syncTableOrder(db, ticket);
  logAuditEvent(db, 'ORDER_STATUS_CHANGED', {
    ticketId: ticket.ticketId, table: ticket.table, from: previous, to: target, staffId: auth.userId
  }, staffActorName(auth), ticket.restaurantId);
  return { status: 200, body: { ok: true }, ticket };
}

// Staff-facing order lookup with restaurant check. Returns [ticket, errorResult].
function loadStaffTicket(db, ticketId, auth) {
  const ticket = findTicket(db, ticketId);
  if (!ticket) return [null, { status: 404, body: { error: 'Order not found.' } }];
  if (!canAccessRestaurant(auth, ticket.restaurantId)) return [null, { status: 403, body: { error: 'This belongs to a different restaurant.' } }];
  if (!isTicketOpen(ticket)) return [null, { status: 409, body: { error: `This order is already ${ticket.status}.` } }];
  return [ticket, null];
}

function confirmPendingRound(db, data, auth) {
  const [ticket, err] = loadStaffTicket(db, data.ticketId, auth);
  if (err) return err;
  const round = (ticket.pendingRounds || []).find(r => r.roundId === data.roundId) || (!data.roundId ? (ticket.pendingRounds || [])[0] : null);
  if (!round) return { status: 404, body: { error: 'Nothing waiting for confirmation on this order.' } };
  confirmRound(db, ticket, round, auth, Array.isArray(data.lines) ? data.lines : null);
  syncTableOrder(db, ticket);
  return { status: 200, body: { ok: true, ticket: guestTicketView(ticket) }, ticket };
}

function rejectPendingRound(db, data, auth) {
  const reason = cleanText(String(data.reason || '').trim(), 200);
  if (!reason) return { status: 400, body: { error: 'Please give a reason for rejecting.' } };
  const [ticket, err] = loadStaffTicket(db, data.ticketId, auth);
  if (err) return err;
  const round = (ticket.pendingRounds || []).find(r => r.roundId === data.roundId) || (!data.roundId ? (ticket.pendingRounds || [])[0] : null);
  if (!round) return { status: 404, body: { error: 'Nothing waiting for confirmation on this order.' } };

  ticket.pendingRounds = ticket.pendingRounds.filter(r => r.roundId !== round.roundId);
  if (!ticket.rounds) ticket.rounds = [];
  ticket.rounds.push({
    roundId: round.roundId, round: round.round, status: 'Rejected', createdAt: round.createdAt,
    rejectedAt: Date.now(), rejectedBy: staffActorName(auth), reason,
    value: round.items.reduce((s, l) => s + l.price * l.qty, 0)
  });
  if ((ticket.items || []).length === 0 && ticket.pendingRounds.length === 0) {
    ticket.status = 'Rejected';
    ticket.rejectReason = reason;
  }
  recomputeTicketTotals(ticket, db);
  addTicketNotice(ticket, `Your order round ${round.round} was not accepted: ${reason}`);
  syncTableOrder(db, ticket);
  logAuditEvent(db, 'ORDER_ROUND_REJECTED', {
    ticketId: ticket.ticketId, table: ticket.table, round: round.round, reason,
    lines: round.items.length, staffId: auth.userId
  }, staffActorName(auth), ticket.restaurantId);
  return { status: 200, body: { ok: true, ticket: guestTicketView(ticket) }, ticket };
}

// Removing a confirmed line: free before the kitchen starts, manager PIN (or admin) after.
function removeConfirmedLine(db, data, auth) {
  const reason = cleanText(String(data.reason || '').trim(), 200);
  if (!reason) return { status: 400, body: { error: 'Please give a reason for removing the item.' } };
  const [ticket, err] = loadStaffTicket(db, data.ticketId, auth);
  if (err) return err;
  const line = (ticket.items || []).find(l => l.lineId === data.lineId);
  if (!line) return { status: 404, body: { error: 'Item not found on this order.' } };
  if (line.voided) return { status: 409, body: { error: 'This item was already removed.' } };

  const kitchenStarted = ticket.status !== 'New';
  const isAdmin = ADMIN_ROLES.includes(auth.role);
  let authorizedBy = staffActorName(auth);
  if (kitchenStarted && !isAdmin) {
    const rest = findRestaurant(db, ticket.restaurantId) || {};
    const lockKey = canonicalRestId(rest.id || ticket.restaurantId);
    if (isPinLocked(lockKey)) return { status: 429, body: { error: 'Too many wrong PIN attempts. Removals are locked for 15 minutes.' } };
    if (!verifySecret(String(data.managerPin || '').trim(), rest.managerPin)) {
      recordPinFailure(lockKey);
      logAuditEvent(db, 'LINE_VOID_REJECTED', { ticketId: ticket.ticketId, lineId: line.lineId, title: line.title, reason, staffId: auth.userId }, staffActorName(auth), ticket.restaurantId);
      return { status: 403, body: { error: 'The kitchen has started this order, so a manager PIN is needed.', needsManagerPin: true } };
    }
    clearPinFailures(lockKey);
    authorizedBy = 'Manager (PIN Verified)';
  }

  line.voided = true;
  line.voidReason = reason;
  line.voidCategory = cleanText(data.category || 'other', 40);
  line.originalPrice = line.price;
  line.voidedBy = staffActorName(auth);
  line.voidAuthorizedBy = authorizedBy;
  line.voidedAt = Date.now();
  recomputeTicketTotals(ticket, db);
  addTicketNotice(ticket, `${line.qty} × ${line.title} was removed from your bill (${reason}).`);
  syncTableOrder(db, ticket);
  logAuditEvent(db, 'LINE_VOIDED', {
    ticketId: ticket.ticketId, table: ticket.table, lineId: line.lineId, title: line.title, qty: line.qty,
    amount: line.originalPrice * line.qty, reason, category: line.voidCategory,
    afterKitchenStarted: kitchenStarted, authorizedBy, staffId: auth.userId, assignedWaiterId: ticket.assignedWaiterId
  }, staffActorName(auth), ticket.restaurantId);
  return { status: 200, body: { ok: true, ticket: guestTicketView(ticket) }, ticket };
}

// Exceptions report for owners: who voided, removed or rejected what, and loose ends.
function buildExceptionsReport(db, restId, fromMs, toMs) {
  const key = canonicalRestId(restId);
  const inRange = ts => ts >= fromMs && ts <= toMs;
  const logs = (db.auditLogs || []).filter(l => canonicalRestId(l.restaurantId) === key && inRange(l.timestamp));
  const tickets = (db.tickets || []).filter(t => canonicalRestId(t.restaurantId || 'REST-001') === key);
  const staff = (db.staff || []).filter(s => canonicalRestId(s.restaurantId) === key);
  const nameOf = id => (staff.find(s => s.id === id) || {}).name || id || 'Unassigned';

  const pick = action => logs.filter(l => l.action === action).map(l => ({ at: l.isoTime, by: l.actor, ...l.details }));
  const voids = pick('ORDER_VOIDED');
  const lineVoids = pick('LINE_VOIDED');
  const rejections = pick('ORDER_ROUND_REJECTED');
  const failedPins = logs.filter(l => l.action === 'VOID_REJECTED' || l.action === 'LINE_VOID_REJECTED').length;

  const perWaiter = {};
  const bump = (id, field, amount = 0) => {
    const k = id || 'unassigned';
    if (!perWaiter[k]) perWaiter[k] = { waiterId: k, waiter: nameOf(k), orderVoids: 0, lineVoids: 0, voidedValue: 0, rejectedRounds: 0, edits: 0 };
    perWaiter[k][field] += 1;
    perWaiter[k].voidedValue += amount;
  };
  voids.forEach(v => bump(v.assignedWaiterId, 'orderVoids', Number(v.amount) || 0));
  lineVoids.forEach(v => bump(v.assignedWaiterId, 'lineVoids', Number(v.amount) || 0));
  rejections.forEach(r => {
    const s = staff.find(x => x.id === r.staffId);
    bump(s ? s.id : r.staffId, 'rejectedRounds');
  });
  pick('ORDER_ROUND_CONFIRMED').filter(c => (c.edits || []).length > 0).forEach(c => bump(c.staffId, 'edits'));

  const now = Date.now();
  const openTickets = tickets.filter(t => isTicketOpen(t));
  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    totals: {
      orderVoids: voids.length,
      orderVoidValue: voids.reduce((s, v) => s + (Number(v.amount) || 0), 0),
      lineVoids: lineVoids.length,
      lineVoidValue: lineVoids.reduce((s, v) => s + (Number(v.amount) || 0), 0),
      rejectedRounds: rejections.length,
      failedPinAttempts: failedPins
    },
    perWaiter: Object.values(perWaiter).sort((a, b) => b.voidedValue - a.voidedValue),
    voids, lineVoids, rejections,
    servedNotSettled: openTickets.filter(t => t.status === 'Served')
      .map(t => ({ ticketId: t.ticketId, table: t.table, total: t.total, waiter: t.assignedWaiterName, minutesOpen: Math.round((now - (t.timestamp || now)) / 60000) })),
    pendingTooLong: openTickets.filter(t => (t.pendingRounds || []).some(r => now - r.createdAt > 5 * 60000))
      .map(t => ({ ticketId: t.ticketId, table: t.table, waiter: t.assignedWaiterName, oldestMinutes: Math.round((now - Math.min(...t.pendingRounds.map(r => r.createdAt))) / 60000) })),
    tablesClosedWithoutInvoice: logs.filter(l => l.action === 'TABLE_RESET').map(l => ({ at: l.isoTime, by: l.actor, ...l.details }))
  };
}

const sseClients = new Set();

function broadcastEvent(eventData) {
  if (!eventData.eventId) {
    eventData.eventId = 'ev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  }
  const payload = 'data: ' + JSON.stringify(eventData) + '\n\n';
  sseClients.forEach(client => {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  });
}

function autoAssignWaiter(db, restaurantId = 'rest-dera-01') {
  const restKey = canonicalRestId(restaurantId);
  const waiters = (db.staff || []).filter(s =>
    canonicalRestId(s.restaurantId) === restKey &&
    s.role === 'waiter' && 
    s.status === 'active'
  );
  if (waiters.length === 0) {
    return { id: 'unassigned', name: 'Unassigned (Self-Service)' };
  }

  // Sort strictly by hierarchyLevel ascending: Rank 1 first, Rank 2 next, Rank 3 next
  waiters.sort((a, b) => (Number(a.hierarchyLevel) || 99) - (Number(b.hierarchyLevel) || 99));

  // Count active orders currently assigned to each waiter (not yet served/settled)
  const activeTickets = (db.tickets || []).filter(t => 
    (canonicalRestId(t.restaurantId) === restKey || !t.restaurantId) &&
    t.status !== 'Served' &&
    !CLOSED_STATUSES.includes(t.status)
  );

  for (const waiter of waiters) {
    const curLoad = activeTickets.filter(t => t.assignedWaiterId === waiter.id).length;
    const maxCap = Number(waiter.maxConcurrentOrders) || 4;
    if (curLoad < maxCap) {
      return { 
        id: waiter.id, 
        name: `${waiter.name} (Rank ${waiter.hierarchyLevel})`, 
        hierarchyLevel: waiter.hierarchyLevel 
      };
    }
  }

  // If all at max capacity, fallback to waiter with minimum active load
  waiters.sort((a, b) => {
    const countA = activeTickets.filter(t => t.assignedWaiterId === a.id).length;
    const countB = activeTickets.filter(t => t.assignedWaiterId === b.id).length;
    return countA - countB;
  });

  const best = waiters[0];
  return { 
    id: best.id, 
    name: `${best.name} (Rank ${best.hierarchyLevel})`, 
    hierarchyLevel: best.hierarchyLevel 
  };
}

const PUBLIC_PAGES = new Set([
  'index.html', 'hub.html', 'restaurant_admin.html', 'super_admin.html',
  'cashier.html', 'waiter.html', 'kds.html', 'admin.html'
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

const SUPER_ROLES = ['super_admin'];
const ADMIN_WRITE_PREFIXES = [
  '/api/staff', '/api/waiter-ranks', '/api/menu', '/api/categories', '/api/sides',
  '/api/tags', '/api/extras', '/api/waiter-services'
];

// Returns the roles allowed to call a route, or null when the route is public.
function requiredRolesFor(method, pathname) {
  if (!pathname.startsWith('/api/')) return null;
  const isWrite = method === 'POST' || method === 'PUT' || method === 'DELETE';

  if (pathname === '/api/super/restaurants' || pathname.startsWith('/api/super/')) return SUPER_ROLES;
  if (pathname === '/api/staff' || pathname.startsWith('/api/staff/')) return ADMIN_ROLES;
  if (isWrite && ADMIN_WRITE_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))) return ADMIN_ROLES;
  if (isWrite && (pathname === '/api/restaurant/theme' || pathname === '/api/restaurant/billing-settings')) return ADMIN_ROLES;
  if (pathname === '/api/test/reset-table') return ADMIN_ROLES;
  if (pathname === '/api/table-session/switch-role') return ADMIN_ROLES;
  if (['/api/orders/confirm', '/api/orders/reject', '/api/orders/remove-line', '/api/tables/open'].includes(pathname)) return STAFF_ROLES;
  if (pathname === '/api/tables/rotate-token' || pathname === '/api/restaurant/order-settings' || pathname === '/api/reports/exceptions') return ADMIN_ROLES;
  if (method === 'GET' && (pathname === '/api/db' || pathname === '/api/tables')) return STAFF_ROLES;
  return null;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Central access control for API routes that change data or expose staff-only data.
  const routeRoles = requiredRolesFor(req.method, pathname);
  if (routeRoles && !requireRole(req, res, routeRoles)) return;

  // Real-time SSE Endpoint
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(': connected\n\n');
    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // Public Safe Info Endpoint (for customer app index.html)
  if (pathname === '/api/public/info' && req.method === 'GET') {
    const db = readDb();
    const restId = parsedUrl.query.restaurantId || 'REST-001';
    const rest = (db.restaurants || []).find(r => r.id === restId || (restId === 'REST-001' && r.id === 'rest-dera-01')) || (db.restaurants && db.restaurants[0]) || {};
    
    const safeTables = (db.tables || []).map(t => ({
      id: t.id,
      name: t.name,
      zone: t.zone || 'Main Dining',
      capacity: t.capacity || 4,
      shape: t.shape || 'square',
      x: typeof t.x === 'number' ? t.x : 50,
      y: typeof t.y === 'number' ? t.y : 50,
      status: t.status === 'dining' ? 'occupied' : 'vacant'
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      restaurant: {
        id: rest.id,
        name: rest.name,
        address: rest.address,
        currency: rest.currency || 'Rs.',
        taxRate: rest.taxRate || 0.05,
        status: rest.status || 'active',
        plan: rest.plan,
        subscriptionCancelled: !!rest.subscriptionCancelled,
        ordering: (() => {
          const o = getOrderSettings(rest);
          return { paused: o.orderingPaused, message: o.pausedMessage, online: o.onlineOrdering, waiterConfirms: o.requireWaiterConfirm };
        })(),
        theme: rest.theme || DEFAULT_THEME,
        billingCharges: (rest.billingCharges && Array.isArray(rest.billingCharges) && rest.billingCharges.length > 0)
          ? rest.billingCharges
          : [
              { id: 'chg_tax_01', name: 'Sales Tax / PRA', type: 'percentage', rate: Math.round((rest.taxRate || 0.05) * 100), enabled: true, category: 'tax' },
              { id: 'chg_svc_02', name: 'Service Charge', type: 'percentage', rate: 10, enabled: false, category: 'service' },
              { id: 'chg_del_03', name: 'Packaging & Takeaway Fee', type: 'fixed', rate: 50, enabled: false, category: 'other' }
            ]
      },
      billingCharges: (rest.billingCharges && Array.isArray(rest.billingCharges) && rest.billingCharges.length > 0)
        ? rest.billingCharges
        : [
            { id: 'chg_tax_01', name: 'Sales Tax / PRA', type: 'percentage', rate: Math.round((rest.taxRate || 0.05) * 100), enabled: true, category: 'tax' },
            { id: 'chg_svc_02', name: 'Service Charge', type: 'percentage', rate: 10, enabled: false, category: 'service' },
            { id: 'chg_del_03', name: 'Packaging & Takeaway Fee', type: 'fixed', rate: 50, enabled: false, category: 'other' }
          ],
      sections: db.sections || Array.from(new Set(safeTables.map(t => t.zone))),
      tables: safeTables,
      soldOut: db.soldOut || [],
      serverIp: getLocalIpAddress(),
      port: PORT,
      mobileUrl: `http://${getLocalIpAddress()}:${PORT}/?table=04`
    }));
    return;
  }

  // Super Admin: List all restaurants
  if (pathname === '/api/super/restaurants' && req.method === 'GET') {
    const db = readDb();
    const rests = (db.restaurants || []).map(publicRestaurant);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(rests));
    return;
  }

  // Super Admin: Add new restaurant
  if (pathname === '/api/super/restaurants' && req.method === 'POST') {
    try {
      const auth = getRequestAuth(req);
      const data = await parseBody(req);
      const db = readDb();
      if (!db.restaurants) db.restaurants = [];

      let planDurationDays = 15;
      let planLabel = "Free Trial (15 Days)";
      if (data.plan === '3m') { planDurationDays = 90; planLabel = "3 Months Plan"; }
      else if (data.plan === '6m') { planDurationDays = 180; planLabel = "6 Months Plan"; }
      else if (data.plan === '12m') { planDurationDays = 365; planLabel = "12 Months Plan"; }

      const startDate = new Date();
      const endDate = new Date(Date.now() + planDurationDays * 86400000);
      const initialPassword = data.password || ('RestPass#' + crypto.randomBytes(6).toString('base64url'));
      const initialPin = data.managerPin ? String(data.managerPin).trim() : generatePin();

      // Calculate unique serialwise restaurant ID (e.g. REST-001, REST-002)
      let serialId = (data.id || '').trim().toUpperCase();
      if (!serialId || (db.restaurants || []).some(r => canonicalRestId(r.id) === canonicalRestId(serialId))) {
        let maxNum = 0;
        (db.restaurants || []).forEach(r => {
          if (r.id) {
            // 'rest-dera-01' is the demo restaurant's legacy alias for REST-001
            const m = canonicalRestId(r.id).match(/REST-(\d+)/i);
            if (m) {
              const num = parseInt(m[1], 10);
              if (num > maxNum) maxNum = num;
            }
          }
        });
        serialId = `REST-${String(maxNum + 1).padStart(3, '0')}`;
      }

      const newRest = {
        id: serialId,
        name: data.name || 'New Restaurant',
        address: data.address || '',
        ownerName: data.ownerName || '',
        ownerPhone: data.ownerPhone || '',
        ownerManagesApp: !!data.ownerManagesApp,
        managerName: data.ownerManagesApp ? '' : (data.managerName || ''),
        managerPhone: data.ownerManagesApp ? '' : (data.managerPhone || ''),
        managerPin: hashSecret(initialPin),
        nextInvoiceNumber: 1001,
        plan: data.plan || 'trial',
        planLabel: planLabel,
        trialDays: data.plan === 'trial' ? 15 : 0,
        status: 'active',
        subscriptionCancelled: false,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        credentials: {
          email: (data.email || '').trim().toLowerCase(),
          password: hashSecret(initialPassword)
        },
        currency: 'Rs.',
        taxRate: 0.05,
        theme: { ...DEFAULT_THEME },
        createdAt: new Date().toISOString()
      };

      db.restaurants.unshift(newRest);
      logAuditEvent(db, 'RESTAURANT_CREATED', { restaurantId: serialId, name: newRest.name, plan: planLabel }, auth ? auth.name : 'Super Admin', serialId);
      writeDb(db);
      broadcastEvent({ type: 'RESTAURANTS_UPDATED', restaurant: publicRestaurant(newRest) });

      // The plaintext password and PIN are returned once so the super admin can hand them over.
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        restaurant: publicRestaurant(newRest),
        initialPassword: data.password ? undefined : initialPassword,
        initialManagerPin: initialPin
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Super Admin: Update / Edit / Cancel Subscription / Manage Subscription
  if (pathname.startsWith('/api/super/restaurants/') && req.method === 'PUT') {
    try {
      const restId = pathname.replace('/api/super/restaurants/', '');
      const auth = getRequestAuth(req);
      const data = await parseBody(req);
      const db = readDb();
      const idx = (db.restaurants || []).findIndex(r => r.id === restId);
      if (idx === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Restaurant not found' }));
        return;
      }

      const rest = db.restaurants[idx];

      // Handle Subscription cancellation toggle
      if (typeof data.subscriptionCancelled === 'boolean') {
        rest.subscriptionCancelled = data.subscriptionCancelled;
        rest.status = rest.subscriptionCancelled ? 'cancelled' : 'active';
        logAuditEvent(db, rest.subscriptionCancelled ? 'SUBSCRIPTION_CANCELLED' : 'SUBSCRIPTION_REACTIVATED', { restaurantId: restId }, auth ? auth.name : 'Super Admin', restId);
      }

      // Handle Edit restaurant info
      if (data.name) rest.name = data.name;
      if (data.address !== undefined) rest.address = data.address;
      if (data.ownerName !== undefined) rest.ownerName = data.ownerName;
      if (data.ownerPhone !== undefined) rest.ownerPhone = data.ownerPhone;
      if (data.managerPin) {
        rest.managerPin = hashSecret(String(data.managerPin).trim());
        clearPinFailures(canonicalRestId(rest.id));
      }
      if (typeof data.ownerManagesApp === 'boolean') {
        rest.ownerManagesApp = data.ownerManagesApp;
        if (rest.ownerManagesApp) {
          rest.managerName = '';
          rest.managerPhone = '';
        } else {
          if (data.managerName !== undefined) rest.managerName = data.managerName;
          if (data.managerPhone !== undefined) rest.managerPhone = data.managerPhone;
        }
      }

      // Handle Manage Subscription: extend trial or change to 3m, 6m, 12m
      if (data.manageAction === 'extend_trial') {
        const addDays = Number(data.additionalDays) || 15;
        const currentEnd = new Date(rest.endDate) > new Date() ? new Date(rest.endDate) : new Date();
        rest.endDate = new Date(currentEnd.getTime() + addDays * 86400000).toISOString();
        rest.plan = 'trial';
        rest.planLabel = `Free Trial (Extended +${addDays}d)`;
        rest.subscriptionCancelled = false;
        rest.status = 'active';
        logAuditEvent(db, 'SUBSCRIPTION_EXTENDED', { restaurantId: restId, addedDays: addDays, newEndDate: rest.endDate }, auth ? auth.name : 'Super Admin', restId);
      } else if (data.manageAction === 'change_plan') {
        let planDays = 90;
        let label = "3 Months Plan";
        if (data.plan === '6m') { planDays = 180; label = "6 Months Plan"; }
        else if (data.plan === '12m') { planDays = 365; label = "12 Months Plan"; }
        else if (data.plan === 'trial') { planDays = 15; label = "Free Trial (15 Days)"; }

        rest.plan = data.plan;
        rest.planLabel = label;
        rest.startDate = new Date().toISOString();
        rest.endDate = new Date(Date.now() + planDays * 86400000).toISOString();
        rest.subscriptionCancelled = false;
        rest.status = 'active';
        logAuditEvent(db, 'SUBSCRIPTION_CHANGED', { restaurantId: restId, newPlan: data.plan }, auth ? auth.name : 'Super Admin', restId);
      }

      if (data.credentials) {
        if (data.credentials.email) rest.credentials.email = data.credentials.email;
        if (data.credentials.password && data.credentials.password !== '***') rest.credentials.password = hashSecret(data.credentials.password);
        logAuditEvent(db, 'CREDENTIALS_CHANGED', { restaurantId: restId, email: rest.credentials.email }, auth ? auth.name : 'Super Admin', restId);
      }

      db.restaurants[idx] = rest;
      writeDb(db);
      broadcastEvent({ type: 'RESTAURANTS_UPDATED', restaurant: publicRestaurant(rest) });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, restaurant: publicRestaurant(rest) }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Unified Auth API: Login for Super Admin, Restaurant Admin, Waiters, and Cashiers
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const email = (data.email || '').trim().toLowerCase();
      const password = (data.password || '').trim();
      const db = readDb();

      const throttleKey = email || 'anonymous';
      if (isLoginLocked(throttleKey)) {
        sendJson(res, 429, { error: 'Too many failed attempts. Try again in 15 minutes.' });
        return;
      }

      // Check Super Admin credentials
      const superAdmin = db.superAdmin;
      if (superAdmin && superAdmin.email && email === superAdmin.email.toLowerCase() && verifySecret(password, superAdmin.password)) {
        const token = generateAuthToken({
          id: 'super-admin-01',
          email: superAdmin.email,
          role: 'super_admin',
          name: superAdmin.name || 'Platform Super Admin',
          restaurantId: 'ALL'
        });
        logAuditEvent(db, 'LOGIN_SUCCESS', { role: 'super_admin', email: email }, 'Platform Super Admin', 'ALL');
        writeDb(db);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          token: token,
          role: 'super_admin',
          user: {
            name: superAdmin.name || 'Platform Super Admin',
            email: superAdmin.email
          }
        }));
        return;
      }

      // Check Restaurant Admin credentials
      const rest = (db.restaurants || []).find(r => 
        r.credentials && 
        (r.credentials.email || '').toLowerCase() === email && 
        verifySecret(password, r.credentials.password)
      );

      if (rest) {
        if (rest.subscriptionCancelled || rest.status === 'cancelled') {
          logAuditEvent(db, 'LOGIN_BLOCKED_SUBSCRIPTION', { role: 'restaurant_admin', email: email, restaurantId: rest.id }, rest.ownerName, rest.id);
          writeDb(db);
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: 'Restaurant subscription is CANCELLED or INACTIVE. Please contact platform super admin.',
            isCancelled: true,
            restaurant: publicRestaurant(rest)
          }));
          return;
        }

        const adminName = rest.ownerManagesApp ? rest.ownerName : (rest.managerName || rest.ownerName);
        const token = generateAuthToken({
          id: rest.id,
          email: rest.credentials.email,
          role: 'restaurant_admin',
          name: adminName,
          restaurantId: rest.id
        });

        logAuditEvent(db, 'LOGIN_SUCCESS', { role: 'restaurant_admin', email: email, restaurantId: rest.id }, adminName, rest.id);
        writeDb(db);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          token: token,
          role: 'restaurant_admin',
          restaurant: publicRestaurant(rest),
          user: {
            name: adminName,
            email: rest.credentials.email,
            restaurantId: rest.id
          }
        }));
        return;
      }

      // Check Staff credentials (Waiters & Cashiers: supports email, mobile number or username)
      const inputPhoneDigits = email.replace(/\D/g, '');
      const staffMember = (db.staff || []).find(s => {
        const staffEmail = (s.email || '').toLowerCase();
        const staffUsername = (s.username || '').toLowerCase();
        const staffPhone = (s.phone || '').replace(/\D/g, '');
        const matchesIdentifier = (staffEmail && staffEmail === email) ||
                                  (staffUsername && staffUsername === email) ||
                                  (staffPhone && (staffPhone === email || (inputPhoneDigits && staffPhone === inputPhoneDigits)));
        return matchesIdentifier && verifySecret(password, s.password);
      });

      if (staffMember) {
        const staffRest = (db.restaurants || []).find(r => r.id === staffMember.restaurantId) || (db.restaurants && db.restaurants[0]);
        if (staffRest && (staffRest.subscriptionCancelled || staffRest.status === 'cancelled')) {
          logAuditEvent(db, 'LOGIN_BLOCKED_SUBSCRIPTION', { role: staffMember.role, email: email, staffId: staffMember.id }, staffMember.name, staffMember.restaurantId);
          writeDb(db);
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: 'Restaurant subscription is inactive. Access locked.',
            isCancelled: true 
          }));
          return;
        }

        const token = generateAuthToken({
          id: staffMember.id,
          email: staffMember.email,
          role: staffMember.role,
          name: staffMember.name,
          restaurantId: staffMember.restaurantId
        });

        logAuditEvent(db, 'LOGIN_SUCCESS', { role: staffMember.role, email: email, staffId: staffMember.id }, staffMember.name, staffMember.restaurantId);
        writeDb(db);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          token: token,
          role: staffMember.role,
          staff: publicStaff(staffMember),
          restaurant: publicRestaurant(staffRest)
        }));
        return;
      }

      recordLoginFailure(throttleKey);
      logAuditEvent(db, 'LOGIN_FAILED', { email: email, attemptedRole: data.role || 'unknown' }, 'Anonymous');
      writeDb(db);

      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid email address or password.' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Staff API: List, Add, Remove, Edit Staff (Waiters & Cashiers)
  if (pathname === '/api/staff' && req.method === 'GET') {
    const db = readDb();
    const auth = getRequestAuth(req);
    const restId = auth.role === 'super_admin' ? (parsedUrl.query.restaurantId || 'REST-001') : auth.restaurantId;
    const staffList = (db.staff || [])
      .filter(s => canonicalRestId(s.restaurantId) === canonicalRestId(restId))
      .map(publicStaff);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(staffList));
    return;
  }

  if (pathname === '/api/staff' && req.method === 'POST') {
    try {
      const auth = getRequestAuth(req);
      const data = await parseBody(req);
      const db = readDb();
      if (!db.staff) db.staff = [];

      const role = data.role === 'cashier' ? 'cashier' : 'waiter';
      const defaultPass = role === 'cashier' 
        ? 'Cashier#' + Math.floor(100 + Math.random() * 900) 
        : 'Waiter#' + Math.floor(100 + Math.random() * 900);

      const requestedRestId = auth.role === 'super_admin' ? (data.restaurantId || 'REST-001') : auth.restaurantId;
      const targetRestId = canonicalRestId(requestedRestId);
      const phoneClean = (data.phone || '').replace(/\D/g, '');
      const initialPassword = data.password || defaultPass;
      const username = (data.username || phoneClean || data.phone || data.email || '').trim();

      const newStaff = {
        id: (role === 'cashier' ? 'cashier-' : 'staff-') + Date.now(),
        restaurantId: targetRestId,
        name: data.name || (role === 'cashier' ? 'New Cashier' : 'New Waiter'),
        phone: phoneClean || data.phone || '',
        username: username,
        email: (data.email || username).trim().toLowerCase(),
        password: hashSecret(initialPassword),
        role: role,
        counter: data.counter || (role === 'cashier' ? 'Counter 01 (Front Register)' : ''),
        rankName: data.rankName || '',
        hierarchyLevel: Number(data.hierarchyLevel) || 1,
        maxConcurrentOrders: Number(data.maxConcurrentOrders) || 4,
        status: data.status || 'active',
        createdAt: new Date().toISOString()
      };

      db.staff.push(newStaff);
      logAuditEvent(db, 'STAFF_CREATED', { staffId: newStaff.id, name: newStaff.name, role: newStaff.role }, auth ? auth.name : 'Admin', targetRestId);
      writeDb(db);
      broadcastEvent({ type: 'STAFF_UPDATED', staff: db.staff.map(publicStaff) });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        staff: publicStaff(newStaff),
        initialPassword: data.password ? undefined : initialPassword
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname.startsWith('/api/staff/') && req.method === 'DELETE') {
    const staffId = pathname.replace('/api/staff/', '');
    const auth = getRequestAuth(req);
    const db = readDb();
    const staffMember = (db.staff || []).find(s => s.id === staffId);
    if (staffMember && !canAccessRestaurant(auth, staffMember.restaurantId)) {
      denyOtherRestaurant(res);
      return;
    }
    db.staff = (db.staff || []).filter(s => s.id !== staffId);
    if (staffMember) {
      logAuditEvent(db, 'STAFF_DELETED', { staffId: staffId, name: staffMember.name, role: staffMember.role }, auth ? auth.name : 'Admin', staffMember.restaurantId);
    }
    writeDb(db);
    broadcastEvent({ type: 'STAFF_UPDATED', staff: db.staff.map(publicStaff) });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (pathname.startsWith('/api/staff/') && req.method === 'PUT') {
    try {
      const staffId = pathname.replace('/api/staff/', '');
      const auth = getRequestAuth(req);
      const data = await parseBody(req);
      const db = readDb();
      const idx = (db.staff || []).findIndex(s => s.id === staffId);
      if (idx >= 0) {
        if (!canAccessRestaurant(auth, db.staff[idx].restaurantId)) {
          denyOtherRestaurant(res);
          return;
        }
        // Only profile fields can be edited; id, restaurant and role stay fixed.
        const EDITABLE_STAFF_FIELDS = ['name', 'phone', 'username', 'email', 'counter', 'rankName', 'hierarchyLevel', 'maxConcurrentOrders', 'status'];
        EDITABLE_STAFF_FIELDS.forEach(field => {
          if (data[field] !== undefined) db.staff[idx][field] = data[field];
        });
        if (data.password && data.password !== '***') {
          db.staff[idx].password = hashSecret(String(data.password).trim());
        }
        logAuditEvent(db, 'STAFF_UPDATED', { staffId: staffId, name: db.staff[idx].name, role: db.staff[idx].role }, auth ? auth.name : 'Admin', db.staff[idx].restaurantId);
        writeDb(db);
        broadcastEvent({ type: 'STAFF_UPDATED', staff: db.staff.map(publicStaff) });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, staff: publicStaff(db.staff[idx]) }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Staff member not found' }));
      }
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ==========================================
  // Waiter Ranks Management Endpoints
  // ==========================================

  // GET /api/waiter-ranks
  if (pathname === '/api/waiter-ranks' && req.method === 'GET') {
    const db = readDb();
    if (!db.waiterRanks || db.waiterRanks.length === 0) {
      db.waiterRanks = DEFAULT_WAITER_RANKS;
      writeDb(db);
    }
    const restId = parsedUrl.query.restaurantId || 'REST-001';
    const ranks = (db.waiterRanks || []).filter(r => !r.restaurantId || r.restaurantId === restId || restId === 'ALL');
    ranks.sort((a, b) => (Number(a.ranking) || 99) - (Number(b.ranking) || 99));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ranks));
    return;
  }

  // POST /api/waiter-ranks (Create or Update Waiter Rank)
  if (pathname === '/api/waiter-ranks' && req.method === 'POST') {
    try {
      const auth = getRequestAuth(req);
      const data = await parseBody(req);
      const db = readDb();
      if (!db.waiterRanks) db.waiterRanks = [];

      const rankName = (data.name || '').trim();
      const ranking = parseInt(data.ranking, 10) || 1;
      const targetRestId = auth.role === 'super_admin' ? (data.restaurantId || 'REST-001') : canonicalRestId(auth.restaurantId);

      if (!rankName) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Rank name is required' }));
        return;
      }

      let rankItem = null;
      if (data.id) {
        const idx = db.waiterRanks.findIndex(r => r.id === data.id);
        if (idx >= 0) {
          db.waiterRanks[idx] = {
            ...db.waiterRanks[idx],
            name: rankName,
            ranking: ranking,
            restaurantId: targetRestId
          };
          rankItem = db.waiterRanks[idx];
        }
      }

      if (!rankItem) {
        rankItem = {
          id: 'rank-' + Date.now(),
          name: rankName,
          ranking: ranking,
          restaurantId: targetRestId
        };
        db.waiterRanks.push(rankItem);
      }

      writeDb(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rank: rankItem, ranks: db.waiterRanks }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // DELETE /api/waiter-ranks/:id (Delete Waiter Rank)
  if (pathname.startsWith('/api/waiter-ranks/') && req.method === 'DELETE') {
    try {
      const rankId = pathname.replace('/api/waiter-ranks/', '').trim();
      const db = readDb();
      if (!db.waiterRanks) db.waiterRanks = [];
      db.waiterRanks = db.waiterRanks.filter(r => r.id !== rankId);
      writeDb(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, deletedId: rankId }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ==========================================
  // Restaurant Brand & Vibe Theme Endpoints
  // ==========================================

  // GET /api/restaurant/theme
  if (pathname === '/api/restaurant/theme' && req.method === 'GET') {
    const db = readDb();
    const auth = getRequestAuth(req);
    const restId = parsedUrl.query.restaurantId || (auth ? auth.restaurantId : 'REST-001');
    const rest = (db.restaurants || []).find(r => r.id === restId || (restId === 'REST-001' && r.id === 'rest-dera-01')) || (db.restaurants && db.restaurants[0]) || {};
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      ok: true, 
      restaurantId: rest.id,
      restaurantName: rest.name,
      theme: rest.theme || DEFAULT_THEME 
    }));
    return;
  }

  // POST /api/restaurant/theme
  if (pathname === '/api/restaurant/theme' && req.method === 'POST') {
    try {
      const auth = getRequestAuth(req);
      const data = await parseBody(req);
      const db = readDb();
      const restId = data.restaurantId || (auth ? auth.restaurantId : null) || parsedUrl.query.restaurantId || 'REST-001';
      if (!canAccessRestaurant(auth, restId)) {
        denyOtherRestaurant(res);
        return;
      }
      const idx = (db.restaurants || []).findIndex(r => r.id === restId || (restId === 'REST-001' && r.id === 'rest-dera-01'));
      if (idx === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Restaurant not found' }));
        return;
      }

      const rest = db.restaurants[idx];
      const existingTheme = rest.theme || DEFAULT_THEME;
      
      const primaryColor = data.primaryColor || existingTheme.primaryColor || '#ac2d00';
      const primaryRgb = hexToRgbString(primaryColor);

      rest.theme = {
        vibePreset: data.vibePreset || existingTheme.vibePreset || 'custom',
        primaryColor: primaryColor,
        primaryColorRgb: primaryRgb,
        primaryContainer: data.primaryContainer || existingTheme.primaryContainer || '#d53e0b',
        accentColor: data.accentColor || existingTheme.accentColor || '#f59e0b',
        surfaceColor: data.surfaceColor || existingTheme.surfaceColor || '#ffffff',
        backgroundColor: data.backgroundColor || existingTheme.backgroundColor || '#f8f9ff',
        fontHeadline: data.fontHeadline || existingTheme.fontHeadline || 'Outfit',
        fontBody: data.fontBody || existingTheme.fontBody || 'DM Sans',
        coverBanner: data.coverBanner !== undefined ? data.coverBanner : existingTheme.coverBanner,
        logoUrl: data.logoUrl !== undefined ? data.logoUrl : (existingTheme.logoUrl || ''),
        tagline: data.tagline !== undefined ? data.tagline : existingTheme.tagline,
        welcomeMessage: data.welcomeMessage !== undefined ? data.welcomeMessage : existingTheme.welcomeMessage
      };

      db.restaurants[idx] = rest;
      logAuditEvent(db, 'THEME_UPDATED', { restaurantId: rest.id, vibe: rest.theme.vibePreset, primaryColor }, auth ? auth.name : 'Restaurant Admin', rest.id);
      writeDb(db);
      broadcastEvent({ type: 'THEME_UPDATED', restaurantId: rest.id, theme: rest.theme });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, theme: rest.theme }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ==========================================
  // Restaurant Billing & Tax Charges Endpoints
  // ==========================================

  // GET /api/restaurant/billing-settings
  if (pathname === '/api/restaurant/billing-settings' && req.method === 'GET') {
    const db = readDb();
    const auth = getRequestAuth(req);
    const restId = parsedUrl.query.restaurantId || (auth ? auth.restaurantId : 'REST-001');
    const rest = (db.restaurants || []).find(r => r.id === restId || (restId === 'REST-001' && r.id === 'rest-dera-01')) || (db.restaurants && db.restaurants[0]) || {};
    
    const billingCharges = (rest.billingCharges && Array.isArray(rest.billingCharges) && rest.billingCharges.length > 0)
      ? rest.billingCharges
      : [
          { id: 'chg_tax_01', name: 'Sales Tax / PRA', type: 'percentage', rate: Math.round((rest.taxRate || 0.05) * 100), enabled: true, category: 'tax' },
          { id: 'chg_svc_02', name: 'Service Charge', type: 'percentage', rate: 10, enabled: false, category: 'service' },
          { id: 'chg_del_03', name: 'Packaging & Takeaway Fee', type: 'fixed', rate: 50, enabled: false, category: 'other' }
        ];

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      restaurantId: rest.id,
      restaurantName: rest.name,
      currency: rest.currency || 'Rs.',
      taxRate: rest.taxRate || 0.05,
      billingCharges: billingCharges
    }));
    return;
  }

  // POST /api/restaurant/billing-settings
  if (pathname === '/api/restaurant/billing-settings' && req.method === 'POST') {
    try {
      const auth = getRequestAuth(req);
      const data = await parseBody(req);
      const db = readDb();
      const restId = data.restaurantId || (auth ? auth.restaurantId : null) || parsedUrl.query.restaurantId || 'REST-001';
      if (!canAccessRestaurant(auth, restId)) {
        denyOtherRestaurant(res);
        return;
      }
      const idx = (db.restaurants || []).findIndex(r => r.id === restId || (restId === 'REST-001' && r.id === 'rest-dera-01'));
      if (idx === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Restaurant not found' }));
        return;
      }

      if (!Array.isArray(data.billingCharges)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'billingCharges must be an array' }));
        return;
      }

      // Sanitize and validate charges
      const sanitizedCharges = data.billingCharges.map((chg, i) => {
        const rate = Math.max(0, Number(chg.rate !== undefined ? chg.rate : chg.amount) || 0);
        return {
          id: chg.id || `chg_${Date.now()}_${i}`,
          name: (chg.name || 'Additional Charge').trim(),
          type: (chg.type === 'fixed') ? 'fixed' : 'percentage',
          rate: rate,
          enabled: chg.enabled !== false,
          category: chg.category || (chg.name && chg.name.toLowerCase().includes('service') ? 'service' : (chg.name && (chg.name.toLowerCase().includes('tax') || chg.name.toLowerCase().includes('pra')) ? 'tax' : 'other'))
        };
      });

      db.restaurants[idx].billingCharges = sanitizedCharges;
      
      // Update primary taxRate for legacy callers if a tax charge is present
      const primaryTax = sanitizedCharges.find(c => c.category === 'tax' && c.enabled);
      if (primaryTax && primaryTax.type === 'percentage') {
        db.restaurants[idx].taxRate = primaryTax.rate / 100;
      }

      logAuditEvent(db, 'BILLING_SETTINGS_UPDATED', {
        restaurantId: db.restaurants[idx].id,
        chargesCount: sanitizedCharges.length,
        charges: sanitizedCharges
      }, auth ? auth.name : 'Restaurant Admin', db.restaurants[idx].id);

      writeDb(db);

      broadcastEvent({
        type: 'BILLING_SETTINGS_UPDATED',
        restaurantId: db.restaurants[idx].id,
        billingCharges: sanitizedCharges
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        message: 'Billing charges and taxes updated successfully',
        billingCharges: sanitizedCharges,
        taxRate: primaryTax ? primaryTax.rate : Math.round((db.restaurants[idx].taxRate || 0.05) * 100)
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ==========================================
  // Table & Section Management Endpoints
  // ==========================================

  // GET /api/tables
  if (pathname === '/api/tables' && req.method === 'GET') {
    const db = readDb();
    const auth = getRequestAuth(req);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify((db.tables || []).map(t => staffTable(t, auth))));
    return;
  }

  // GET /api/sections
  if (pathname === '/api/sections' && req.method === 'GET') {
    const db = readDb();
    const sections = db.sections || Array.from(new Set((db.tables || []).map(t => t.zone).filter(Boolean)));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(sections));
    return;
  }

  // POST /api/sections (Add new section/zone)
  if (pathname === '/api/sections' && req.method === 'POST') {
    try {
      const auth = getRequestAuth(req);
      if (!auth || (auth.role !== 'restaurant_admin' && auth.role !== 'super_admin')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Only restaurant admins can manage floor sections' }));
        return;
      }
      const data = await parseBody(req);
      const sectionName = (data.name || '').trim();
      if (!sectionName) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Section name is required' }));
        return;
      }
      const db = readDb();
      if (!db.sections) {
        db.sections = Array.from(new Set((db.tables || []).map(t => t.zone).filter(Boolean)));
      }
      if (!db.sections.includes(sectionName)) {
        db.sections.push(sectionName);
        logAuditEvent(db, 'SECTION_CREATED', { section: sectionName }, auth.name || 'Admin', auth.restaurantId);
        writeDb(db);
        broadcastEvent({ type: 'SECTIONS_UPDATED', sections: db.sections });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, sections: db.sections }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ==========================================
  // Multi-Person Table Session Endpoints
  // ==========================================

  // POST /api/table-session/join (1st person to scan becomes Host)
  if (pathname === '/api/table-session/join' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const rawTable = (data.table || '04').toString().replace('Table ', '').trim();
      const tNum = rawTable.padStart(2, '0');
      const tableStr = `Table ${tNum}`;
      const deviceId = (data.deviceId || '').trim();
      const clientName = cleanText((data.name || '').trim(), 60);

      if (!deviceId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'deviceId is required to bind table session' }));
        return;
      }

      const db = readDb();
      const tbl = findTable(db, rawTable);
      const accessError = tableAccessError(tbl, data.tableToken);
      if (accessError) {
        sendJson(res, 403, { error: accessError, invalidTable: true });
        return;
      }

      // Check if table order is active or settled
      const openTicket = findOpenTicketForTable(db, tbl);
      const hasActiveOrder = Boolean(openTicket);

      // Check if existing session is active and valid (less than 1 hour old)
      const sessionValid = tbl.session && tbl.session.hostDeviceId && (Date.now() - (tbl.session.createdAt || 0) < 3600000);

      // If table is vacant, has no session, has no active order, or client claims host:
      let isNewSession = false;
      if (!sessionValid || (!hasActiveOrder && data.claimHost) || data.forceHost) {
        tbl.session = {
          sessionId: (sessionValid && tbl.session.sessionId) || ('sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
          hostDeviceId: deviceId,
          hostName: clientName || `Table Host`,
          createdAt: Date.now(),
          draftCart: (!hasActiveOrder && (data.claimHost || data.forceHost)) ? [] : (tbl.session ? (tbl.session.draftCart || []) : [])
        };
        isNewSession = true;
        writeDb(db);
        broadcastEvent({
          type: 'TABLE_SESSION_UPDATED',
          table: tableStr,
          hostName: tbl.session.hostName,
          sessionId: tbl.session.sessionId
        });
      }

      const isHost = (tbl.session.hostDeviceId === deviceId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        table: tNum,
        tableStr: tableStr,
        isHost: isHost,
        hostName: tbl.session.hostName,
        sessionId: tbl.session.sessionId,
        draftCart: tbl.session.draftCart || [],
        hasActiveOrder: hasActiveOrder,
        activeTicket: hasActiveOrder ? guestTicketView(openTicket) : null
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // POST /api/table-session/cart (Authoritative table cart operations)
  if (pathname === '/api/table-session/cart' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const rawTable = (data.table || '04').toString().replace('Table ', '').trim();
      const tNum = rawTable.padStart(2, '0');
      const tableStr = `Table ${tNum}`;
      const deviceId = (data.deviceId || '').trim();
      const action = data.action || 'sync'; // 'sync' | 'add' | 'adjust' | 'remove' | 'clear'

      const db = readDb();
      const tbl = findTable(db, rawTable);
      const accessError = tableAccessError(tbl, data.tableToken);
      if (accessError) {
        sendJson(res, 403, { error: accessError, invalidTable: true });
        return;
      }

      if (!tbl.session) {
        tbl.session = {
          sessionId: 'sess_' + Date.now(),
          hostDeviceId: deviceId || 'host',
          hostName: 'Table Lead',
          createdAt: Date.now(),
          draftCart: []
        };
      }
      if (!Array.isArray(tbl.session.draftCart)) {
        tbl.session.draftCart = [];
      }

      if (action === 'add' && data.item) {
        const item = cleanGuestFields({ ...data.item });
        const existing = tbl.session.draftCart.find(ci => 
          ci.dishId === item.dishId && ci.size === item.size && ci.spice === item.spice && ci.note === item.note
        );
        if (existing) {
          existing.qty += (Number(item.qty) || 1);
        } else {
          tbl.session.draftCart.push(item);
        }
      } else if (action === 'adjust') {
        const delta = Number(data.delta) || 0;
        let targetIdx = -1;
        if (data.item) {
          targetIdx = tbl.session.draftCart.findIndex(ci =>
            (ci.dishId === data.item.dishId || ci.title === data.item.title) &&
            ci.size === data.item.size &&
            ci.spice === data.item.spice &&
            ci.note === data.item.note
          );
        }
        if (targetIdx === -1 && typeof data.index === 'number') {
          targetIdx = data.index;
        }
        if (targetIdx >= 0 && tbl.session.draftCart[targetIdx]) {
          tbl.session.draftCart[targetIdx].qty += delta;
          if (tbl.session.draftCart[targetIdx].qty <= 0) {
            tbl.session.draftCart.splice(targetIdx, 1);
          }
        }
      } else if (action === 'remove') {
        let targetIdx = -1;
        if (data.item) {
          targetIdx = tbl.session.draftCart.findIndex(ci =>
            (ci.dishId === data.item.dishId || ci.title === data.item.title) &&
            ci.size === data.item.size &&
            ci.spice === data.item.spice &&
            ci.note === data.item.note
          );
        }
        if (targetIdx === -1 && typeof data.index === 'number') {
          targetIdx = data.index;
        }
        if (targetIdx >= 0 && tbl.session.draftCart[targetIdx]) {
          tbl.session.draftCart.splice(targetIdx, 1);
        }
      } else if (action === 'clear') {
        tbl.session.draftCart = [];
      } else {
        // Full sync
        if (Array.isArray(data.cart)) {
          tbl.session.draftCart = data.cart;
        }
      }

      writeDb(db);

      broadcastEvent({
        type: 'TABLE_CART_UPDATED',
        table: tableStr,
        cart: tbl.session.draftCart,
        senderDeviceId: deviceId,
        action: action
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, cart: tbl.session.draftCart }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // GET /api/table-session/poll (Lightweight polling fallback for mobile devices)
  if (pathname === '/api/table-session/poll' && req.method === 'GET') {
    const rawTable = (parsedUrl.query.table || '04').toString().replace('Table ', '').trim();
    const tNum = rawTable.padStart(2, '0');
    const tableStr = `Table ${tNum}`;
    const deviceId = (parsedUrl.query.deviceId || '').trim();

    const db = readDb();
    const tbl = findTable(db, rawTable);
    const accessError = tableAccessError(tbl, parsedUrl.query.t || parsedUrl.query.tableToken);
    if (accessError) {
      sendJson(res, 403, { error: accessError, invalidTable: true });
      return;
    }

    const openTicket = findOpenTicketForTable(db, tbl);
    const hasActiveOrder = Boolean(openTicket);
    const isHost = Boolean(tbl && tbl.session && tbl.session.hostDeviceId === deviceId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      table: tNum,
      isHost: isHost,
      hostName: tbl && tbl.session ? tbl.session.hostName : 'Table Lead',
      draftCart: tbl && tbl.session ? (tbl.session.draftCart || []) : [],
      hasActiveOrder: hasActiveOrder,
      activeTicket: hasActiveOrder ? guestTicketView(openTicket) : null
    }));
    return;
  }

  // POST /api/table-session/switch-role (Testing tool to toggle between Host & Guest)
  if (pathname === '/api/table-session/switch-role' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const rawTable = (data.table || '04').toString().replace('Table ', '').trim();
      const tNum = rawTable.padStart(2, '0');
      const tableStr = `Table ${tNum}`;
      const deviceId = (data.deviceId || '').trim();
      const targetRole = data.targetRole || 'toggle'; // 'host' | 'guest' | 'toggle'

      const db = readDb();
      let tbl = (db.tables || []).find(t => t.id === tNum || (t.name && t.name.toLowerCase() === tableStr.toLowerCase()) || t.id === rawTable);
      if (!tbl) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Table not found' }));
        return;
      }

      if (!tbl.session) {
        tbl.session = {
          sessionId: 'sess_' + Date.now(),
          hostDeviceId: deviceId,
          hostName: 'Table Lead',
          createdAt: Date.now(),
          draftCart: []
        };
      }

      const currentIsHost = (tbl.session.hostDeviceId === deviceId);
      let willBeHost = false;

      if (targetRole === 'host') {
        tbl.session.hostDeviceId = deviceId;
        tbl.session.hostName = data.name || 'Table Lead';
        willBeHost = true;
      } else if (targetRole === 'guest') {
        tbl.session.hostDeviceId = 'host_peer_' + Math.random().toString(36).substring(2, 6);
        tbl.session.hostName = 'Other Host';
        willBeHost = false;
      } else {
        // Toggle
        if (currentIsHost) {
          tbl.session.hostDeviceId = 'host_peer_' + Math.random().toString(36).substring(2, 6);
          tbl.session.hostName = 'Other Host';
          willBeHost = false;
        } else {
          tbl.session.hostDeviceId = deviceId;
          tbl.session.hostName = data.name || 'Table Lead';
          willBeHost = true;
        }
      }

      writeDb(db);
      broadcastEvent({
        type: 'TABLE_SESSION_UPDATED',
        table: tableStr,
        hostName: tbl.session.hostName,
        sessionId: tbl.session.sessionId
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        isHost: willBeHost,
        hostName: tbl.session.hostName
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // POST /api/tables (Create or Edit Table)
  if (pathname === '/api/tables' && req.method === 'POST') {
    try {
      const auth = getRequestAuth(req);
      if (!auth || (auth.role !== 'restaurant_admin' && auth.role !== 'super_admin')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Only restaurant admins can create or modify tables' }));
        return;
      }
      const data = await parseBody(req);
      const db = readDb();
      if (!db.tables) db.tables = [];

      let tableId = data.id ? String(data.id).trim() : '';
      const tableName = (data.name || (tableId ? `Table ${tableId}` : 'New Table')).trim();
      const zone = (data.zone || 'Main Dining').trim();
      const capacity = Number(data.capacity) || 4;
      const shape = ['round', 'square', 'rect', 'booth'].includes(data.shape) ? data.shape : 'square';
      const x = typeof data.x === 'number' ? Math.max(2, Math.min(95, data.x)) : 50;
      const y = typeof data.y === 'number' ? Math.max(2, Math.min(95, data.y)) : 50;

      // Check if table exists by ID
      const existingIdx = db.tables.findIndex(t => t.id === tableId || (tableId && t.name.toLowerCase() === tableName.toLowerCase()));
      
      let savedTable;
      if (existingIdx >= 0) {
        // Update existing table
        db.tables[existingIdx].name = tableName;
        db.tables[existingIdx].zone = zone;
        db.tables[existingIdx].capacity = capacity;
        db.tables[existingIdx].shape = shape;
        db.tables[existingIdx].x = x;
        db.tables[existingIdx].y = y;
        savedTable = db.tables[existingIdx];
        logAuditEvent(db, 'TABLE_UPDATED', { id: savedTable.id, name: tableName, zone, capacity, shape, x, y }, auth.name || 'Admin', auth.restaurantId);
      } else {
        // Create new table
        if (!tableId) {
          let maxNum = 0;
          db.tables.forEach(t => {
            const n = parseInt(t.id, 10);
            if (!isNaN(n) && n > maxNum) maxNum = n;
          });
          tableId = String(maxNum + 1).padStart(2, '0');
        }
        savedTable = {
          id: tableId,
          name: tableName,
          zone: zone,
          capacity: capacity,
          shape: shape,
          x: x,
          y: y,
          status: 'vacant',
          order: null,
          qrToken: generateTableToken()
        };
        db.tables.push(savedTable);
        logAuditEvent(db, 'TABLE_CREATED', { id: tableId, name: tableName, zone, capacity, shape, x, y }, auth.name || 'Admin', auth.restaurantId);
      }

      // Ensure zone is in db.sections
      if (!db.sections) db.sections = [];
      if (zone && !db.sections.includes(zone)) {
        db.sections.push(zone);
      }

      writeDb(db);
      broadcastEvent({ type: 'TABLES_UPDATED', tables: (db.tables || []).map(publicTable), sections: db.sections });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, table: savedTable, tables: db.tables }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // POST /api/tables/layout (Batch position update from drag-and-drop floor designer)
  if (pathname === '/api/tables/layout' && req.method === 'POST') {
    try {
      const auth = getRequestAuth(req);
      if (!auth || (auth.role !== 'restaurant_admin' && auth.role !== 'super_admin')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Only restaurant admins can rearrange floor layouts' }));
        return;
      }
      const data = await parseBody(req);
      const positions = Array.isArray(data.positions) ? data.positions : [];
      const db = readDb();
      if (!db.tables) db.tables = [];

      let updatedCount = 0;
      positions.forEach(pos => {
        const tbl = db.tables.find(t => t.id === String(pos.id));
        if (tbl) {
          if (typeof pos.x === 'number') tbl.x = Math.max(2, Math.min(95, pos.x));
          if (typeof pos.y === 'number') tbl.y = Math.max(2, Math.min(95, pos.y));
          updatedCount++;
        }
      });

      if (updatedCount > 0) {
        logAuditEvent(db, 'FLOOR_LAYOUT_REARRANGED', { updatedTables: updatedCount }, auth.name || 'Admin', auth.restaurantId);
        writeDb(db);
        broadcastEvent({ type: 'TABLES_UPDATED', tables: (db.tables || []).map(publicTable) });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, updatedCount }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // DELETE /api/tables/:id (Delete a Table with Occupancy Guard)
  if (pathname.startsWith('/api/tables/') && req.method === 'DELETE') {
    const tableId = pathname.replace('/api/tables/', '').trim();
    const auth = getRequestAuth(req);
    if (!auth || (auth.role !== 'restaurant_admin' && auth.role !== 'super_admin')) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Only restaurant admins can delete dining tables' }));
      return;
    }
    const db = readDb();
    const tbl = (db.tables || []).find(t => t.id === tableId || t.name.toLowerCase() === tableId.toLowerCase());
    if (!tbl) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Table not found' }));
      return;
    }
    // Guard against deleting occupied table
    if (tbl.status === 'dining' || (tbl.order && tbl.order.ticketId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: `Cannot delete ${tbl.name} while occupied with an active dining order (#${tbl.order ? tbl.order.ticketId : 'active'}). Settle or void the order first.`
      }));
      return;
    }

    db.tables = (db.tables || []).filter(t => t.id !== tbl.id);
    logAuditEvent(db, 'TABLE_DELETED', { id: tbl.id, name: tbl.name, zone: tbl.zone }, auth.name || 'Admin', auth.restaurantId);
    writeDb(db);
    broadcastEvent({ type: 'TABLES_UPDATED', tables: (db.tables || []).map(publicTable) });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, deletedId: tbl.id }));
    return;
  }

  // Menu API: List menu dishes
  if (pathname === '/api/menu' && req.method === 'GET') {
    const db = readDb();
    const restId = parsedUrl.query.restaurantId || 'REST-001';
    let menuList = (db.menu || []).filter(m => 
      !restId || 
      m.restaurantId === restId || 
      (restId === 'REST-001' && (m.restaurantId === 'REST-001' || m.restaurantId === 'rest-dera-01'))
    );
    if (menuList.length === 0 && (!db.menu || db.menu.length === 0)) {
      db.menu = DEFAULT_MENU;
      writeDb(db);
      menuList = db.menu;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(menuList));
    return;
  }

  // Menu API: Add new dish
  if (pathname === '/api/menu' && req.method === 'POST') {
    try {
      const auth = getRequestAuth(req);
      const data = await parseBody(req);
      const db = readDb();
      if (!db.menu) db.menu = [...(DEFAULT_MENU || [])];

      const targetRestId = canonicalRestId(auth.role === 'super_admin' ? (data.restaurantId || 'REST-001') : auth.restaurantId);

      const basePrice = Number(data.price) || Number(data.regularPrice) || (data.sizeOptions && data.sizeOptions[0] ? Number(data.sizeOptions[0].price || data.sizeOptions[0].extra || 0) : 0);
      const newDish = {
        id: data.id || ('dish-' + Date.now()),
        restaurantId: targetRestId,
        title: data.title || 'New Dish',
        category: data.category || 'karahi',
        station: data.station || 'karahi',
        price: basePrice,
        regularPrice: Number(data.regularPrice) || basePrice,
        hasCustomSizes: !!data.hasCustomSizes,
        rating: 5.0,
        prepTime: data.prepTime || '15-20 min',
        calories: data.calories || '550 kcal',
        dietary: data.dietary || '',
        isSpicy: !!data.isSpicy,
        isChef: !!data.isChef,
        isBestSeller: !!data.isBestSeller,
        isVeg: !!data.isVeg,
        tags: Array.isArray(data.tags) ? data.tags : [],
        enableSpice: data.enableSpice !== false,
        allowNotes: data.allowNotes !== false,
        desc: data.desc || '',
        image: data.image || '',
        status: data.status || 'available',
        isAvailable: data.isAvailable !== false,
        sizeOptions: data.sizeOptions || [
          { name: "Regular", price: basePrice, extra: 0, desc: "Standard serving" }
        ],
        addons: data.addons || [],
        dealItems: Array.isArray(data.dealItems) ? data.dealItems : [],
        dealBadge: data.dealBadge || data.badge || (data.category === 'deals' ? 'Special Deal' : ''),
        discountPercent: Number(data.discountPercent) || 0,
        createdAt: new Date().toISOString()
      };

      db.menu.unshift(newDish);
      logAuditEvent(db, 'MENU_ITEM_CREATED', { dishId: newDish.id, title: newDish.title, price: newDish.price }, auth ? auth.name : 'Admin', targetRestId);
      writeDb(db);
      broadcastEvent({ type: 'MENU_UPDATE', dishes: db.menu });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, dish: newDish }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Menu API: Update dish details or toggle availability
  if (pathname.startsWith('/api/menu/') && req.method === 'PUT') {
    try {
      const dishId = pathname.replace('/api/menu/', '');
      const auth = getRequestAuth(req);
      const data = await parseBody(req);
      const db = readDb();
      if (!db.menu) db.menu = [...(DEFAULT_MENU || [])];

      const idx = db.menu.findIndex(d => String(d.id) === String(dishId));
      if (idx >= 0) {
        if (!canAccessRestaurant(auth, db.menu[idx].restaurantId)) {
          denyOtherRestaurant(res);
          return;
        }
        const oldPrice = db.menu[idx].price;
        const { id: _ignoredId, restaurantId: _ignoredRest, ...changes } = data;
        db.menu[idx] = { ...db.menu[idx], ...changes };
        
        // Audit price alterations
        if (data.price !== undefined && data.price !== oldPrice) {
          logAuditEvent(db, 'PRICE_ALTERATION', { dishId: dishId, title: db.menu[idx].title, oldPrice: oldPrice, newPrice: data.price }, auth ? auth.name : 'Admin', db.menu[idx].restaurantId);
        }

        writeDb(db);
        broadcastEvent({ type: 'MENU_UPDATE', dishes: db.menu });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, dish: db.menu[idx] }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Dish not found' }));
      }
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Menu API: Delete dish
  if (pathname.startsWith('/api/menu/') && req.method === 'DELETE') {
    const dishId = pathname.replace('/api/menu/', '');
    const auth = getRequestAuth(req);
    const db = readDb();
    if (!db.menu) db.menu = [];
    const item = db.menu.find(d => String(d.id) === String(dishId));
    if (item && !canAccessRestaurant(auth, item.restaurantId)) {
      denyOtherRestaurant(res);
      return;
    }
    db.menu = db.menu.filter(d => String(d.id) !== String(dishId));
    if (item) {
      logAuditEvent(db, 'MENU_ITEM_DELETED', { dishId: dishId, title: item.title }, auth ? auth.name : 'Admin', item.restaurantId);
    }
    writeDb(db);
    broadcastEvent({ type: 'MENU_UPDATE', dishes: db.menu });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // --- CATEGORIES API ---
  if (pathname === '/api/categories' && req.method === 'GET') {
    const db = readDb();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(db.categories || DEFAULT_CATEGORIES));
    return;
  }

  if (pathname === '/api/categories' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const db = readDb();
      if (!db.categories) db.categories = [...DEFAULT_CATEGORIES];
      const newCat = {
        id: (data.name || 'cat').toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now(),
        name: (data.name || 'New Category').trim(),
        icon: data.icon || 'restaurant',
        description: data.description || ''
      };
      db.categories.push(newCat);
      writeDb(db);
      broadcastEvent({ type: 'CATEGORIES_UPDATE', categories: db.categories });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, category: newCat }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname.startsWith('/api/categories/') && req.method === 'PUT') {
    try {
      const catId = pathname.replace('/api/categories/', '');
      const data = await parseBody(req);
      const db = readDb();
      if (!db.categories) db.categories = [...DEFAULT_CATEGORIES];
      const idx = db.categories.findIndex(c => c.id === catId);
      if (idx >= 0) {
        db.categories[idx] = { ...db.categories[idx], ...data };
        writeDb(db);
        broadcastEvent({ type: 'CATEGORIES_UPDATE', categories: db.categories });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, category: db.categories[idx] }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Category not found' }));
      }
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname.startsWith('/api/categories/') && req.method === 'DELETE') {
    const catId = pathname.replace('/api/categories/', '');
    const db = readDb();
    if (!db.categories) db.categories = [...DEFAULT_CATEGORIES];
    db.categories = db.categories.filter(c => c.id !== catId);
    writeDb(db);
    broadcastEvent({ type: 'CATEGORIES_UPDATE', categories: db.categories });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // --- SIDES API ---
  if (pathname === '/api/sides' && req.method === 'GET') {
    const db = readDb();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(db.sides || DEFAULT_SIDES));
    return;
  }

  if (pathname === '/api/sides' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const db = readDb();
      if (!db.sides) db.sides = [...DEFAULT_SIDES];
      const newSide = {
        id: 'side-' + Date.now(),
        name: (data.name || 'New Side').trim(),
        price: Math.max(0, Number(data.price) || 0),
        isAvailable: data.isAvailable !== false,
        description: data.description || ''
      };
      db.sides.push(newSide);
      writeDb(db);
      broadcastEvent({ type: 'SIDES_UPDATE', sides: db.sides });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, side: newSide }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname.startsWith('/api/sides/') && req.method === 'PUT') {
    try {
      const sideId = pathname.replace('/api/sides/', '');
      const data = await parseBody(req);
      const db = readDb();
      if (!db.sides) db.sides = [...DEFAULT_SIDES];
      const idx = db.sides.findIndex(s => s.id === sideId);
      if (idx >= 0) {
        db.sides[idx] = { ...db.sides[idx], ...data };
        writeDb(db);
        broadcastEvent({ type: 'SIDES_UPDATE', sides: db.sides });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, side: db.sides[idx] }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Side not found' }));
      }
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname.startsWith('/api/sides/') && req.method === 'DELETE') {
    const sideId = pathname.replace('/api/sides/', '');
    const db = readDb();
    if (!db.sides) db.sides = [...DEFAULT_SIDES];
    db.sides = db.sides.filter(s => s.id !== sideId);
    writeDb(db);
    broadcastEvent({ type: 'SIDES_UPDATE', sides: db.sides });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // --- TAGS API ---
  if (pathname === '/api/tags' && req.method === 'GET') {
    const db = readDb();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(db.tags || DEFAULT_TAGS));
    return;
  }

  if (pathname === '/api/tags' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const db = readDb();
      if (!db.tags) db.tags = [...DEFAULT_TAGS];
      const newTag = {
        id: 'tag-' + Date.now(),
        name: (data.name || 'Custom Tag').trim(),
        icon: data.icon || 'sell',
        color: data.color || 'slate'
      };
      db.tags.push(newTag);
      writeDb(db);
      broadcastEvent({ type: 'TAGS_UPDATE', tags: db.tags });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, tag: newTag }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname.startsWith('/api/tags/') && req.method === 'PUT') {
    try {
      const tagId = pathname.replace('/api/tags/', '');
      const data = await parseBody(req);
      const db = readDb();
      if (!db.tags) db.tags = [...DEFAULT_TAGS];
      const idx = db.tags.findIndex(t => t.id === tagId);
      if (idx >= 0) {
        db.tags[idx] = { ...db.tags[idx], ...data };
        writeDb(db);
        broadcastEvent({ type: 'TAGS_UPDATE', tags: db.tags });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, tag: db.tags[idx] }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Tag not found' }));
      }
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname.startsWith('/api/tags/') && req.method === 'DELETE') {
    const tagId = pathname.replace('/api/tags/', '');
    const db = readDb();
    if (!db.tags) db.tags = [...DEFAULT_TAGS];
    db.tags = db.tags.filter(t => t.id !== tagId);
    writeDb(db);
    broadcastEvent({ type: 'TAGS_UPDATE', tags: db.tags });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // --- EXTRAS (POST-ORDER DINING ADD-ONS) API ---
  if (pathname === '/api/extras' && req.method === 'GET') {
    const db = readDb();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(db.extras || DEFAULT_EXTRAS));
    return;
  }

  if (pathname === '/api/extras' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const db = readDb();
      if (!db.extras) db.extras = [...DEFAULT_EXTRAS];
      const newExtra = {
        id: 'extra-' + Date.now(),
        name: (data.name || 'New Extra').trim(),
        fullName: (data.fullName || data.name || 'New Extra').trim(),
        price: Math.max(0, Number(data.price) || 0),
        icon: data.icon || '⚡',
        station: data.station || 'rice_naan',
        isAvailable: data.isAvailable !== false,
        description: data.description || ''
      };
      db.extras.push(newExtra);
      writeDb(db);
      broadcastEvent({ type: 'EXTRAS_UPDATE', extras: db.extras });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, extra: newExtra }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname.startsWith('/api/extras/') && req.method === 'PUT') {
    try {
      const extraId = pathname.replace('/api/extras/', '');
      const data = await parseBody(req);
      const db = readDb();
      if (!db.extras) db.extras = [...DEFAULT_EXTRAS];
      const idx = db.extras.findIndex(e => e.id === extraId);
      if (idx >= 0) {
        db.extras[idx] = { ...db.extras[idx], ...data };
        writeDb(db);
        broadcastEvent({ type: 'EXTRAS_UPDATE', extras: db.extras });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, extra: db.extras[idx] }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Extra item not found' }));
      }
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname.startsWith('/api/extras/') && req.method === 'DELETE') {
    const extraId = pathname.replace('/api/extras/', '');
    const db = readDb();
    if (!db.extras) db.extras = [...DEFAULT_EXTRAS];
    db.extras = db.extras.filter(e => e.id !== extraId);
    writeDb(db);
    broadcastEvent({ type: 'EXTRAS_UPDATE', extras: db.extras });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // --- WAITER SERVICES API (CUSTOMIZABLE CALL WAITER OPTIONS) ---
  if (pathname === '/api/waiter-services' && req.method === 'GET') {
    const db = readDb();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(db.waiterServices || DEFAULT_WAITER_SERVICES));
    return;
  }

  if (pathname === '/api/waiter-services' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const db = readDb();
      if (!db.waiterServices) db.waiterServices = [...DEFAULT_WAITER_SERVICES];
      const newService = {
        id: 'ws-' + Date.now(),
        name: (data.name || 'New Service').trim(),
        icon: (data.icon || 'notifications_active').trim(),
        price: Math.max(0, Number(data.price) || 0),
        category: data.category || (Number(data.price) > 0 ? 'item' : 'service'),
        station: data.station || (Number(data.price) > 0 ? 'rice_naan' : 'service'),
        isAvailable: data.isAvailable !== false,
        description: (data.description || '').trim()
      };
      db.waiterServices.push(newService);
      writeDb(db);
      broadcastEvent({ type: 'WAITER_SERVICES_UPDATE', waiterServices: db.waiterServices });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: newService }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname.startsWith('/api/waiter-services/') && req.method === 'PUT') {
    try {
      const serviceId = pathname.replace('/api/waiter-services/', '');
      const data = await parseBody(req);
      const db = readDb();
      if (!db.waiterServices) db.waiterServices = [...DEFAULT_WAITER_SERVICES];
      const idx = db.waiterServices.findIndex(s => s.id === serviceId);
      if (idx >= 0) {
        db.waiterServices[idx] = { ...db.waiterServices[idx], ...data };
        writeDb(db);
        broadcastEvent({ type: 'WAITER_SERVICES_UPDATE', waiterServices: db.waiterServices });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: db.waiterServices[idx] }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Waiter service not found' }));
      }
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname.startsWith('/api/waiter-services/') && req.method === 'DELETE') {
    const serviceId = pathname.replace('/api/waiter-services/', '');
    const db = readDb();
    if (!db.waiterServices) db.waiterServices = [...DEFAULT_WAITER_SERVICES];
    db.waiterServices = db.waiterServices.filter(s => s.id !== serviceId);
    writeDb(db);
    broadcastEvent({ type: 'WAITER_SERVICES_UPDATE', waiterServices: db.waiterServices });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // --- CASHIER TILL & SHIFT CONTROLS ---

  // Open Shift with Float
  if (pathname === '/api/cashier/shift/open' && req.method === 'POST') {
    try {
      const auth = getRequestAuth(req);
      if (!auth || !['cashier', 'restaurant_admin', 'super_admin'].includes(auth.role)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Cashier or Admin authentication token required to open a shift.' }));
        return;
      }

      const data = await parseBody(req);
      const db = readDb();
      if (!db.shifts) db.shifts = [];

      const targetRestId = auth.restaurantId === 'ALL' ? 'REST-001' : (auth.restaurantId || 'REST-001');

      // Check if there is an active shift for this cashier
      const existingOpen = db.shifts.find(s => s.status === 'open' && (s.cashierId === auth.userId || s.restaurantId === targetRestId));
      if (existingOpen) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'A shift is already open. Please close current shift before starting a new one.', shift: existingOpen }));
        return;
      }

      const openingFloat = Math.max(0, Number(data.openingFloat) || 0);
      const newShift = {
        id: 'SHIFT-' + Date.now(),
        restaurantId: targetRestId,
        cashierId: auth.userId,
        cashierName: auth.name || data.cashierName || 'Cashier',
        openedAt: new Date().toISOString(),
        openingFloat: openingFloat,
        expectedCash: openingFloat,
        totalSales: 0,
        transactionsCount: 0,
        status: 'open'
      };

      db.shifts.unshift(newShift);
      logAuditEvent(db, 'SHIFT_OPENED', { shiftId: newShift.id, openingFloat: openingFloat }, auth.name, targetRestId);
      writeDb(db);
      broadcastEvent({ type: 'SHIFT_STATUS', shift: newShift });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, shift: newShift }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Get Current Open Shift Status
  if (pathname === '/api/cashier/shift/current' && req.method === 'GET') {
    const auth = getRequestAuth(req);
    const db = readDb();
    const restId = (auth && auth.restaurantId && auth.restaurantId !== 'ALL') ? auth.restaurantId : (parsedUrl.query.restaurantId || 'REST-001');
    const openShift = (db.shifts || []).find(s => s.status === 'open' && (s.restaurantId === restId || (auth && s.cashierId === auth.userId)));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, shift: openShift || null }));
    return;
  }

  // Close Shift with Blind Cash Count & Variance Reconciliation
  if (pathname === '/api/cashier/shift/close' && req.method === 'POST') {
    try {
      const auth = getRequestAuth(req);
      if (!auth || !['cashier', 'restaurant_admin', 'super_admin'].includes(auth.role)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Cashier or Admin authentication token required to close shift.' }));
        return;
      }

      const data = await parseBody(req);
      const db = readDb();
      const targetRestId = auth.restaurantId === 'ALL' ? 'REST-001' : (auth.restaurantId || 'REST-001');
      const shift = (db.shifts || []).find(s => s.status === 'open' && (s.cashierId === auth.userId || s.id === data.shiftId || s.restaurantId === targetRestId));

      if (!shift) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No active open shift found to close.' }));
        return;
      }

      const countedCash = Math.max(0, Number(data.countedCash) || 0);
      const expectedCash = Number(shift.expectedCash) || Number(shift.openingFloat) || 0;
      const variance = countedCash - expectedCash; // Positive = Over, Negative = Short

      shift.closedAt = new Date().toISOString();
      shift.countedCash = countedCash;
      shift.variance = variance;
      shift.status = 'closed';
      shift.notes = data.notes || '';

      const varianceLabel = variance === 0 ? 'BALANCED' : (variance > 0 ? `OVER (+Rs. ${variance})` : `SHORT (-Rs. ${Math.abs(variance)})`);

      logAuditEvent(db, 'SHIFT_CLOSED', {
        shiftId: shift.id,
        openingFloat: shift.openingFloat,
        expectedCash: expectedCash,
        countedCash: countedCash,
        variance: variance,
        varianceLabel: varianceLabel,
        totalSales: shift.totalSales,
        transactionsCount: shift.transactionsCount,
        notes: shift.notes
      }, auth.name, shift.restaurantId);

      writeDb(db);
      broadcastEvent({ type: 'SHIFT_STATUS', shift: shift });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        shift: shift,
        summary: {
          shiftId: shift.id,
          openingFloat: shift.openingFloat,
          expectedCash: expectedCash,
          countedCash: countedCash,
          variance: variance,
          varianceLabel: varianceLabel,
          totalSales: shift.totalSales,
          transactionsCount: shift.transactionsCount
        }
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // --- HARDENED CASHIER SETTLEMENT WITH SEQUENTIAL GAPLESS INVOICING ---
  if (pathname === '/api/cashier/settle' && req.method === 'POST') {
    try {
      const auth = getRequestAuth(req);
      if (!auth || !['cashier', 'restaurant_admin', 'super_admin'].includes(auth.role)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized: Cashier or Admin authentication token required to settle bills.' }));
        return;
      }

      const data = await parseBody(req);
      const db = readDb();
      const tableStr = (data.table || '').trim();
      const tNum = tableStr.replace('Table ', '').padStart(2, '0');
      const tbl = db.tables.find(t => t.id === tNum || (tableStr && t.name.toLowerCase() === tableStr.toLowerCase()) || t.id === tableStr);

      // Only an open ticket can be settled, and only by staff of its restaurant
      const byId = data.ticketId ? findTicket(db, data.ticketId) : null;
      const ticket = (byId && isTicketOpen(byId)) ? byId : findOpenTicketForTable(db, tbl);
      if (!ticket) {
        sendJson(res, 404, { error: byId ? `Order ${byId.ticketId} is already ${byId.status}.` : 'No open order found for this table.' });
        return;
      }
      if (!canAccessRestaurant(auth, ticket.restaurantId)) {
        denyOtherRestaurant(res);
        return;
      }

      // Unconfirmed rounds were never served, so they are dropped rather than billed
      if ((ticket.pendingRounds || []).length > 0) {
        logAuditEvent(db, 'PENDING_ROUNDS_DROPPED_AT_SETTLE', {
          ticketId: ticket.ticketId,
          rounds: ticket.pendingRounds.map(r => r.round)
        }, auth.name, ticket.restaurantId);
        ticket.droppedRounds = (ticket.droppedRounds || []).concat(ticket.pendingRounds);
        ticket.pendingRounds = [];
      }

      // Bill from the confirmed lines at the prices locked when they were ordered
      recomputeTicketTotals(ticket, db);
      const authoritativeTotal = ticket.total;
      const authoritativeSubtotal = ticket.subtotal;
      const authoritativeTax = ticket.tax;
      const itemsSnapshot = (ticket.items || []).map(l => ({ ...l }));

      // Check cash received if cash payment
      const paymentMethod = data.paymentMethod || 'Cash';
      const cashReceived = Number(data.cashReceived) || authoritativeTotal;
      if (paymentMethod === 'Cash' && cashReceived < authoritativeTotal) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: `Insufficient cash tendered: received Rs. ${cashReceived}, required Rs. ${authoritativeTotal}` 
        }));
        return;
      }
      const changeGiven = paymentMethod === 'Cash' ? Math.max(0, cashReceived - authoritativeTotal) : 0;

      // Generate gapless sequential invoice number
      const year = new Date().getFullYear();
      const invSeq = Number(db.nextInvoiceNumber) || 1001;
      const invoiceNumber = `INV-${year}-${String(invSeq).padStart(5, '0')}`;
      db.nextInvoiceNumber = invSeq + 1;

      // Update active shift if any
      const targetRestId = (ticket && ticket.restaurantId) || auth.restaurantId || 'REST-001';
      const activeShift = (db.shifts || []).find(s => s.status === 'open' && (s.cashierId === auth.userId || s.restaurantId === targetRestId));
      if (activeShift) {
        if (paymentMethod === 'Cash') {
          activeShift.expectedCash = (Number(activeShift.expectedCash) || 0) + authoritativeTotal;
        }
        activeShift.totalSales = (Number(activeShift.totalSales) || 0) + authoritativeTotal;
        activeShift.transactionsCount = (Number(activeShift.transactionsCount) || 0) + 1;
      }

      ticket.status = 'Settled';
      ticket.paymentStatus = 'paid';
      ticket.invoiceNumber = invoiceNumber;
      ticket.settledBy = auth.name;
      ticket.settledAt = new Date().toISOString();
      addTicketNotice(ticket, `Paid. Invoice ${invoiceNumber}. Thank you!`);
      // Closing the ticket frees the table and ends the QR session
      syncTableOrder(db, ticket);
      if (tbl && tbl.order === null) tbl.session = null;

      // Clear table service requests
      db.serviceBells = (db.serviceBells || []).filter(b => b.table !== tableStr);

      // Record in immutable sales ledger
      const newSale = {
        id: 'SALE-' + Date.now().toString().slice(-5),
        invoiceNumber: invoiceNumber,
        ticketId: ticket ? ticket.ticketId : (data.ticketId || '#TKT-MISC'),
        restaurantId: targetRestId,
        table: tableStr,
        items: itemsSnapshot,
        subtotal: authoritativeSubtotal,
        tax: authoritativeTax,
        total: authoritativeTotal,
        paymentMethod: paymentMethod,
        cashReceived: cashReceived,
        changeGiven: changeGiven,
        cashierId: auth.userId,
        cashierName: auth.name || 'Front Cashier',
        shiftId: activeShift ? activeShift.id : null,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now()
      };

      if (!db.sales) db.sales = [];
      db.sales.unshift(newSale);

      // Log financial audit event
      logAuditEvent(db, 'BILL_SETTLED', {
        invoiceNumber: invoiceNumber,
        ticketId: newSale.ticketId,
        table: tableStr,
        total: authoritativeTotal,
        paymentMethod: paymentMethod,
        cashReceived: cashReceived,
        changeGiven: changeGiven,
        cashier: auth.name
      }, auth.name, targetRestId);

      writeDb(db);

      const eventPayload = {
        type: 'BILL_SETTLED',
        table: tableStr,
        ticketId: newSale.ticketId,
        invoiceNumber: invoiceNumber,
        total: authoritativeTotal,
        sale: newSale
      };
      broadcastEvent(eventPayload);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, sale: newSale, invoiceNumber: invoiceNumber }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // --- ORDER CONTROLS: waiter confirmation, rejection and line removal ---
  if (req.method === 'POST' && ['/api/orders/confirm', '/api/orders/reject', '/api/orders/remove-line'].includes(pathname)) {
    try {
      const auth = getRequestAuth(req);
      const data = await parseBody(req);
      const db = readDb();
      const action = pathname.split('/').pop();
      const result = action === 'confirm' ? confirmPendingRound(db, data, auth)
        : action === 'reject' ? rejectPendingRound(db, data, auth)
        : removeConfirmedLine(db, data, auth);
      if (result.status !== 200) {
        writeDb(db); // keeps failed-PIN audit entries
        sendJson(res, result.status, result.body);
        return;
      }
      writeDb(db);
      broadcastEvent({ type: 'ORDER_UPDATED', ticketId: result.ticket.ticketId, table: result.ticket.table, status: result.ticket.status });
      sendJson(res, 200, result.body);
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
    return;
  }

  // Waiter opens a table for QR ordering (when the restaurant requires it)
  if (pathname === '/api/tables/open' && req.method === 'POST') {
    try {
      const auth = getRequestAuth(req);
      const data = await parseBody(req);
      const db = readDb();
      const tbl = findTable(db, data.table);
      if (!tbl) {
        sendJson(res, 404, { error: 'Table not found.' });
        return;
      }
      tbl.openForOrders = data.open !== false;
      tbl.openedBy = staffActorName(auth);
      tbl.openedAt = Date.now();
      logAuditEvent(db, tbl.openForOrders ? 'TABLE_OPENED' : 'TABLE_CLOSED_FOR_ORDERS', { table: tbl.name, tableId: tbl.id }, staffActorName(auth), auth.restaurantId);
      writeDb(db);
      broadcastEvent({ type: 'TABLES_UPDATED' });
      sendJson(res, 200, { ok: true, table: { id: tbl.id, name: tbl.name, openForOrders: tbl.openForOrders } });
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
    return;
  }

  // Admin: issue a new secret for a table's QR (old printed codes stop working)
  if (pathname === '/api/tables/rotate-token' && req.method === 'POST') {
    try {
      const auth = getRequestAuth(req);
      const data = await parseBody(req);
      const db = readDb();
      const tbl = findTable(db, data.tableId || data.table);
      if (!tbl) {
        sendJson(res, 404, { error: 'Table not found.' });
        return;
      }
      tbl.qrToken = generateTableToken();
      tbl.session = null;
      logAuditEvent(db, 'TABLE_QR_ROTATED', { table: tbl.name, tableId: tbl.id }, staffActorName(auth), auth.restaurantId);
      writeDb(db);
      sendJson(res, 200, { ok: true, table: { id: tbl.id, name: tbl.name, qrToken: tbl.qrToken } });
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
    return;
  }

  // Admin: order control settings
  if (pathname === '/api/restaurant/order-settings') {
    try {
      const auth = getRequestAuth(req);
      const db = readDb();
      const data = req.method === 'POST' ? await parseBody(req) : {};
      const restId = auth.role === 'super_admin' ? (data.restaurantId || parsedUrl.query.restaurantId || 'REST-001') : auth.restaurantId;
      const rest = findRestaurant(db, restId);
      if (!rest) {
        sendJson(res, 404, { error: 'Restaurant not found.' });
        return;
      }
      if (req.method === 'POST') {
        const current = rest.orderSettings || {};
        const next = { ...current };
        ['requireWaiterConfirm', 'requireTableOpen', 'orderingPaused', 'onlineOrdering'].forEach(k => {
          if (typeof data[k] === 'boolean') next[k] = data[k];
        });
        if (typeof data.pausedMessage === 'string') next.pausedMessage = cleanText(data.pausedMessage, 200);
        rest.orderSettings = next;
        logAuditEvent(db, 'ORDER_SETTINGS_UPDATED', { settings: next }, staffActorName(auth), rest.id);
        writeDb(db);
        broadcastEvent({ type: 'ORDER_SETTINGS_UPDATED', restaurantId: rest.id, orderingPaused: getOrderSettings(rest).orderingPaused });
      }
      sendJson(res, 200, { ok: true, settings: getOrderSettings(rest) });
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
    return;
  }

  // Admin: exceptions report (voids, removals, rejections, loose ends)
  if (pathname === '/api/reports/exceptions' && req.method === 'GET') {
    const auth = getRequestAuth(req);
    const db = readDb();
    const restId = auth.role === 'super_admin' ? (parsedUrl.query.restaurantId || 'REST-001') : auth.restaurantId;
    const parseDay = (v, endOfDay) => {
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
      const d = new Date(v + (endOfDay ? 'T23:59:59.999' : 'T00:00:00'));
      return isNaN(d.getTime()) ? null : d.getTime();
    };
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const fromMs = parseDay(parsedUrl.query.from, false) || startOfToday.getTime();
    const toMs = parseDay(parsedUrl.query.to, true) || Date.now();
    sendJson(res, 200, { ok: true, report: buildExceptionsReport(db, restId, fromMs, toMs) });
    return;
  }

  // --- MANAGER VOID & ORDER OVERRIDE ---
  if (pathname === '/api/orders/void' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const db = readDb();
      const auth = getRequestAuth(req);
      const ticketId = data.ticketId;
      const reason = (data.reason || '').trim();
      const pin = (data.managerPin || '').trim();

      if (!ticketId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'ticketId is required for void operation.' }));
        return;
      }
      if (!reason) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'A mandatory void reason is required for audit trail.' }));
        return;
      }

      const ticket = (db.tickets || []).find(t => t.ticketId === ticketId);
      if (!ticket) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Ticket not found.' }));
        return;
      }

      if (ticket.status === 'Voided') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Order is already marked as Voided.' }));
        return;
      }
      if (ticket.status === 'Settled') {
        sendJson(res, 409, { error: 'This order is already paid and invoiced, so it cannot be voided.' });
        return;
      }

      // Verify Authorization: Manager PIN or Admin Token
      const ticketRestId = canonicalRestId(ticket.restaurantId || 'REST-001');
      const rest = (db.restaurants || []).find(r => canonicalRestId(r.id) === ticketRestId) || {};
      const pinLockKey = canonicalRestId(rest.id || ticketRestId);

      const isAuthorizedByToken = Boolean(auth && ADMIN_ROLES.includes(auth.role) && canAccessRestaurant(auth, ticketRestId));
      let isAuthorizedByPin = false;
      if (!isAuthorizedByToken && pin) {
        if (isPinLocked(pinLockKey)) {
          sendJson(res, 429, { error: 'Too many wrong PIN attempts. Voids are locked for 15 minutes.' });
          return;
        }
        isAuthorizedByPin = verifySecret(pin, rest.managerPin);
        if (isAuthorizedByPin) clearPinFailures(pinLockKey);
        else recordPinFailure(pinLockKey);
      }

      if (!isAuthorizedByPin && !isAuthorizedByToken) {
        logAuditEvent(db, 'VOID_REJECTED', {
          ticketId: ticketId,
          reason: reason,
          enteredPin: pin ? '****' : 'none'
        }, auth ? auth.name : 'Unknown Staff', ticket.restaurantId);
        writeDb(db);

        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid Manager PIN or insufficient authorization.' }));
        return;
      }

      const actor = isAuthorizedByPin ? 'Manager (PIN Verified)' : (auth.name || 'Admin');
      const requestedBy = auth ? staffActorName(auth) : 'Unknown';
      ticket.status = 'Voided';
      ticket.voidReason = cleanText(reason, 200);
      ticket.voidedBy = actor;
      ticket.voidRequestedBy = requestedBy;
      ticket.voidedAt = new Date().toISOString();
      addTicketNotice(ticket, `This order was cancelled by the restaurant (${ticket.voidReason}).`);

      // Free the table and end its QR session
      syncTableOrder(db, ticket);

      logAuditEvent(db, 'ORDER_VOIDED', {
        ticketId: ticketId,
        table: ticket.table,
        amount: (Number(ticket.total) || 0) + (Number(ticket.pendingTotal) || 0),
        reason: ticket.voidReason,
        authorizedBy: actor,
        requestedBy: requestedBy,
        staffId: auth ? auth.userId : null,
        assignedWaiterId: ticket.assignedWaiterId
      }, actor, ticket.restaurantId);

      writeDb(db);

      broadcastEvent({
        type: 'STATUS_UPDATE',
        ticketId: ticketId,
        status: 'Voided',
        table: ticket.table,
        voidReason: reason
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, message: `Order ${ticketId} successfully voided.`, ticket: guestTicketView(ticket) }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // --- AUDIT TRAIL QUERY ENDPOINT ---
  if (pathname === '/api/audit-logs' && req.method === 'GET') {
    const auth = getRequestAuth(req);
    if (!auth || !['restaurant_admin', 'super_admin'].includes(auth.role)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Admin or Super Admin authentication required to access audit ledger.' }));
      return;
    }
    const db = readDb();
    const restId = parsedUrl.query.restaurantId;
    let logs = db.auditLogs || [];
    if (auth.role === 'restaurant_admin') {
      logs = logs.filter(l => l.restaurantId === auth.restaurantId || !l.restaurantId);
    } else if (restId && restId !== 'ALL') {
      logs = logs.filter(l => l.restaurantId === restId);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(logs));
    return;
  }

  // Test/Demo Reset Table Endpoint
  if (pathname === '/api/test/reset-table' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const tNum = tableNumberFrom(data.table || '04');
        const tableStr = `Table ${tNum}`;
        const db = readDb();
        const auth = getRequestAuth(req);
        const tbl = findTable(db, tNum);

        // Any open order is closed as Voided (never Settled: no money was taken)
        let open = findOpenTicketForTable(db, tbl);
        while (open) {
          open.status = 'Voided';
          open.voidReason = 'Table reset by admin';
          open.voidedBy = staffActorName(auth);
          open.voidedAt = new Date().toISOString();
          logAuditEvent(db, 'TABLE_RESET', { table: open.table, ticketId: open.ticketId, amount: open.total }, staffActorName(auth), open.restaurantId);
          syncTableOrder(db, open);
          open = findOpenTicketForTable(db, tbl);
        }

        if (tbl) {
          tbl.status = 'vacant';
          tbl.order = null;
          tbl.session = null;
        }

        writeDb(db);

        broadcastEvent({
          type: 'BILL_SETTLED',
          table: tableStr,
          timestamp: Date.now()
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `Table ${tNum} reset successfully` }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Unified broadcast endpoint (hardened against price tampering and phantom settles)
  if (pathname === '/api/broadcast' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const eventData = JSON.parse(body);
        const db = readDb();

        // Guests may only place orders and ring the service bell. Everything else
        // (status changes, sold-out lists, settlements, custom events) needs a staff login.
        const PUBLIC_EVENT_TYPES = ['NEW_ORDER', 'SERVICE_BELL'];
        if (!PUBLIC_EVENT_TYPES.includes(eventData.type) && eventData.type !== 'BILL_SETTLED') {
          const broadcastAuth = getRequestAuth(req);
          if (!broadcastAuth || !STAFF_ROLES.includes(broadcastAuth.role)) {
            sendJson(res, 403, { error: 'Staff login required for this update.' });
            return;
          }
        }

        if (eventData.type === 'NEW_ORDER' && eventData.order) {
          const result = placeOrder(db, eventData, getRequestAuth(req));
          if (result.status !== 200) {
            sendJson(res, result.status, result.body);
            return;
          }
          writeDb(db);
          const view = result.body.order;
          broadcastEvent({ type: 'NEW_ORDER', table: view.table, ticketId: view.ticketId, status: view.status, order: view });
          sendJson(res, 200, { ok: true, order: view, nothingNew: Boolean(result.body.nothingNew) });
          return;
        } else if (eventData.type === 'STATUS_UPDATE') {
          const statusAuth = getRequestAuth(req);
          const result = changeTicketStatus(db, eventData.ticketId, eventData.status, statusAuth);
          if (result.status !== 200) {
            sendJson(res, result.status, result.body);
            return;
          }
          writeDb(db);
          broadcastEvent({ type: 'STATUS_UPDATE', ticketId: result.ticket.ticketId, table: result.ticket.table, status: result.ticket.status });
          sendJson(res, 200, { ok: true, status: result.ticket.status });
          return;
        } else if (eventData.type === 'SERVICE_BELL') {
          cleanGuestFields(eventData, ['table', 'request']);
          const bellAuth = getRequestAuth(req);
          if (!(bellAuth && STAFF_ROLES.includes(bellAuth.role))) {
            const bellTable = findTable(db, eventData.table);
            const accessError = tableAccessError(bellTable, eventData.tableToken);
            if (accessError) {
              sendJson(res, 403, { error: accessError, invalidTable: true });
              return;
            }
            eventData.table = bellTable.name || `Table ${bellTable.id}`;
          }
          delete eventData.tableToken;
          if (!db.serviceBells) db.serviceBells = [];
          db.serviceBells.unshift({
            id: 'B-' + Date.now(),
            table: eventData.table,
            request: eventData.request,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
          writeDb(db);
        } else if (eventData.type === 'BILL_SETTLED') {
          // Reject direct phantom unauthenticated BILL_SETTLED events on /api/broadcast
          const auth = getRequestAuth(req);
          if (!auth || !['cashier', 'restaurant_admin', 'super_admin'].includes(auth.role)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Direct unauthenticated BILL_SETTLED broadcasts are blocked. Please settle through /api/cashier/settle.' }));
            return;
          }
        } else if (eventData.type === 'ITEM_86_UPDATE') {
          db.soldOut = Array.isArray(eventData.soldOutList) ? eventData.soldOutList : [];
          writeDb(db);
        }

        broadcastEvent(eventData);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Full DB Read Endpoint (staff only; secrets always stripped)
  if (pathname === '/api/db' && req.method === 'GET') {
    sendJson(res, 200, publicDb(readDb(), getRequestAuth(req)));
    return;
  }

  // Public: the open ticket for one table, so a guest's phone can restore its order
  if (pathname === '/api/public/table-ticket' && req.method === 'GET') {
    const db = readDb();
    const tbl = findTable(db, parsedUrl.query.table);
    const accessError = tableAccessError(tbl, parsedUrl.query.t || parsedUrl.query.tableToken);
    if (accessError) {
      sendJson(res, 403, { error: accessError, invalidTable: true });
      return;
    }
    const tickets = [];
    const open = findOpenTicketForTable(db, tbl);
    if (open) tickets.push(guestTicketView(open));
    // Lets a phone learn that its earlier ticket at this table was paid or cancelled
    const ticketId = String(parsedUrl.query.ticketId || '');
    const earlier = ticketId ? findTicket(db, ticketId) : null;
    if (earlier && earlier !== open && (earlier.tableId === tbl.id || earlier.table === tbl.name)) {
      tickets.push(guestTicketView(earlier));
    }
    sendJson(res, 200, { tickets });
    return;
  }

  // Static File Serving: only the app's HTML pages are public.
  // Data files, server source and tests are never served.
  let filePath = pathname === '/' ? '/hub.html' : pathname;
  const fileName = path.basename(filePath);
  if (path.dirname(path.posix.normalize(filePath)) !== '/' || !PUBLIC_PAGES.has(fileName)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }
  let safePath = path.join(__dirname, fileName);

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(safePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('RESTAURANT ECOSYSTEM SERVER RUNNING ON http://0.0.0.0:' + PORT);
  console.log('LOCAL NETWORK ACCESS (MOBILE): http://' + getLocalIpAddress() + ':' + PORT);
});
