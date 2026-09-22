const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'pos_db.json');
const AUTH_SECRET = process.env.AUTH_SECRET || 'pos_secure_secret_key_2026_dera';

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

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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
        if (!r.managerPin) r.managerPin = "7788";
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
} else {
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
    if (!r.managerPin) { r.managerPin = "7788"; updated = true; }
    if (!r.nextInvoiceNumber) { r.nextInvoiceNumber = 1001; updated = true; }
    if (!r.theme) { r.theme = { ...DEFAULT_THEME }; updated = true; }
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

function calculateAuthoritativeOrder(order, db, targetRestId) {
  const restId = targetRestId || order.restaurantId || 'rest-dera-01';
  const rest = (db.restaurants || []).find(r => r.id === restId || (restId === 'REST-001' && r.id === 'rest-dera-01') || (restId === 'rest-dera-01' && r.id === 'REST-001')) || (db.restaurants && db.restaurants[0]) || {};
  const taxRate = Number(rest.taxRate) || 0.05;

  const catalog = [
    ...(Array.isArray(db.menu) ? db.menu : []),
    ...(Array.isArray(DEFAULT_MENU) ? DEFAULT_MENU : [])
  ];
  let subtotal = 0;

  const authoritativeItems = (order.items || []).map(item => {
    const canonical = catalog.find(d => 
      String(d.id) === String(item.dishId) || 
      (d.title && item.title && d.title.toLowerCase().trim() === item.title.toLowerCase().trim())
    );

    let unitPrice = canonical ? canonical.price : (Number(item.price) || 0);

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
      size: item.size || 'Standard Portion',
      spice: item.spice || 'Normal 🍃',
      station: canonical ? canonical.station : (item.station || 'karahi'),
      notes: item.notes || item.note || ''
    };
  });

  const billingCharges = (rest.billingCharges && Array.isArray(rest.billingCharges) && rest.billingCharges.length > 0)
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
        // fixed flat amount
        amount = Math.round(Number(charge.rate !== undefined ? charge.rate : charge.amount) || 0);
      }
      
      const chgCat = charge.category || (charge.name && charge.name.toLowerCase().includes('service') ? 'service' : 'tax');
      if (chgCat === 'tax' || charge.name.toLowerCase().includes('tax') || charge.name.toLowerCase().includes('pra') || charge.name.toLowerCase().includes('gst')) {
        taxSum += amount;
      } else if (chgCat === 'service' || charge.name.toLowerCase().includes('service')) {
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

  const total = subtotal + totalChargesAmount;

  return {
    items: authoritativeItems,
    subtotal: subtotal,
    tax: taxSum,
    serviceCharge: serviceSum,
    charges: appliedCharges,
    total: total
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
  const waiters = (db.staff || []).filter(s => 
    s.restaurantId === restaurantId && 
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
    (t.restaurantId === restaurantId || !t.restaurantId) && 
    t.status !== 'Served' && 
    t.status !== 'Settled'
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
    const auth = getRequestAuth(req);
    const rests = (db.restaurants || []).map(r => {
      const copy = { ...r };
      // If caller is not authenticated super admin, redact password
      if (!auth || auth.role !== 'super_admin') {
        if (copy.credentials) copy.credentials = { email: copy.credentials.email, password: '***' };
      }
      return copy;
    });
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

      // Calculate unique serialwise restaurant ID (e.g. REST-001, REST-002)
      let serialId = (data.id || '').trim().toUpperCase();
      if (!serialId || (db.restaurants || []).some(r => r.id === serialId)) {
        let maxNum = 0;
        (db.restaurants || []).forEach(r => {
          if (r.id) {
            const m = r.id.match(/REST-(\d+)/i);
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
        managerPin: "7788",
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
          password: data.password || 'RestPass#' + Math.floor(100 + Math.random() * 900)
        },
        currency: 'Rs.',
        taxRate: 0.05,
        theme: { ...DEFAULT_THEME },
        createdAt: new Date().toISOString()
      };

      db.restaurants.unshift(newRest);
      logAuditEvent(db, 'RESTAURANT_CREATED', { restaurantId: serialId, name: newRest.name, plan: planLabel }, auth ? auth.name : 'Super Admin', serialId);
      writeDb(db);
      broadcastEvent({ type: 'RESTAURANTS_UPDATED', restaurant: newRest });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, restaurant: newRest }));
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
      if (data.managerPin) rest.managerPin = String(data.managerPin).trim();
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
        if (data.credentials.password) rest.credentials.password = data.credentials.password;
        logAuditEvent(db, 'CREDENTIALS_CHANGED', { restaurantId: restId, email: rest.credentials.email }, auth ? auth.name : 'Super Admin', restId);
      }

      db.restaurants[idx] = rest;
      writeDb(db);
      broadcastEvent({ type: 'RESTAURANTS_UPDATED', restaurant: rest });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, restaurant: rest }));
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

      // Check Super Admin credentials
      const superAdmin = db.superAdmin || { email: "superadmin@deragourmet.com", password: "SuperAdmin#2026", name: "Platform Super Admin" };
      if (email === superAdmin.email.toLowerCase() && password === superAdmin.password) {
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
        r.credentials.email.toLowerCase() === email && 
        r.credentials.password === password
      );

      if (rest) {
        if (rest.subscriptionCancelled || rest.status === 'cancelled') {
          logAuditEvent(db, 'LOGIN_BLOCKED_SUBSCRIPTION', { role: 'restaurant_admin', email: email, restaurantId: rest.id }, rest.ownerName, rest.id);
          writeDb(db);
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: 'Restaurant subscription is CANCELLED or INACTIVE. Please contact platform super admin.',
            isCancelled: true,
            restaurant: rest 
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
          restaurant: rest,
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
        return matchesIdentifier && s.password === password;
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
          staff: staffMember,
          restaurant: staffRest
        }));
        return;
      }

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
    const restId = parsedUrl.query.restaurantId || 'REST-001';
    const auth = getRequestAuth(req);
    const staffList = (db.staff || [])
      .filter(s => 
        !restId || 
        s.restaurantId === restId || 
        (restId === 'REST-001' && s.restaurantId === 'rest-dera-01')
      )
      .map(s => {
        const copy = { ...s };
        // Mask passwords if caller is not admin
        if (!auth || (auth.role !== 'restaurant_admin' && auth.role !== 'super_admin')) {
          copy.password = '***';
        }
        return copy;
      });
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

      const targetRestId = data.restaurantId === 'rest-dera-01' ? 'REST-001' : (data.restaurantId || 'REST-001');
      const phoneClean = (data.phone || '').replace(/\D/g, '');
      const username = (data.username || phoneClean || data.phone || data.email || '').trim();

      const newStaff = {
        id: (role === 'cashier' ? 'cashier-' : 'staff-') + Date.now(),
        restaurantId: targetRestId,
        name: data.name || (role === 'cashier' ? 'New Cashier' : 'New Waiter'),
        phone: phoneClean || data.phone || '',
        username: username,
        email: (data.email || username).trim().toLowerCase(),
        password: data.password || defaultPass,
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
      broadcastEvent({ type: 'STAFF_UPDATED', staff: db.staff });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, staff: newStaff }));
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
    db.staff = (db.staff || []).filter(s => s.id !== staffId);
    if (staffMember) {
      logAuditEvent(db, 'STAFF_DELETED', { staffId: staffId, name: staffMember.name, role: staffMember.role }, auth ? auth.name : 'Admin', staffMember.restaurantId);
    }
    writeDb(db);
    broadcastEvent({ type: 'STAFF_UPDATED', staff: db.staff });
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
        db.staff[idx] = { ...db.staff[idx], ...data };
        logAuditEvent(db, 'STAFF_UPDATED', { staffId: staffId, name: db.staff[idx].name, role: db.staff[idx].role }, auth ? auth.name : 'Admin', db.staff[idx].restaurantId);
        writeDb(db);
        broadcastEvent({ type: 'STAFF_UPDATED', staff: db.staff });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, staff: db.staff[idx] }));
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
      const targetRestId = data.restaurantId || (auth ? auth.restaurantId : 'REST-001') || 'REST-001';

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
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(db.tables || []));
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
      const clientName = (data.name || '').trim();

      if (!deviceId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'deviceId is required to bind table session' }));
        return;
      }

      const db = readDb();
      if (!db.tables) db.tables = [];

      let tbl = db.tables.find(t => t.id === tNum || (t.name && t.name.toLowerCase() === tableStr.toLowerCase()) || t.id === rawTable);
      if (!tbl) {
        tbl = {
          id: tNum,
          name: tableStr,
          zone: 'Main Dining',
          capacity: 4,
          shape: 'square',
          x: 50,
          y: 50,
          status: 'available',
          order: null
        };
        db.tables.push(tbl);
      }

      // Check if table order is active or settled
      const hasActiveOrder = Boolean(tbl.order && tbl.order.ticketId && tbl.order.status !== 'Settled');

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
          hostDeviceId: tbl.session.hostDeviceId,
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
        hostDeviceId: tbl.session.hostDeviceId,
        hostName: tbl.session.hostName,
        sessionId: tbl.session.sessionId,
        draftCart: tbl.session.draftCart || [],
        hasActiveOrder: hasActiveOrder,
        activeTicket: hasActiveOrder ? tbl.order : null
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
      let tbl = (db.tables || []).find(t => t.id === tNum || (t.name && t.name.toLowerCase() === tableStr.toLowerCase()) || t.id === rawTable);
      if (!tbl) {
        tbl = {
          id: tNum,
          name: tableStr,
          zone: 'Main Dining',
          capacity: 4,
          shape: 'square',
          x: 50,
          y: 50,
          status: 'available',
          order: null
        };
        if (!db.tables) db.tables = [];
        db.tables.push(tbl);
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
        const item = data.item;
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
    let tbl = (db.tables || []).find(t => t.id === tNum || (t.name && t.name.toLowerCase() === tableStr.toLowerCase()) || t.id === rawTable);

    const hasActiveOrder = Boolean(tbl && tbl.order && tbl.order.ticketId && tbl.order.status !== 'Settled');
    const isHost = Boolean(tbl && tbl.session && tbl.session.hostDeviceId === deviceId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      table: tNum,
      isHost: isHost,
      hostDeviceId: tbl && tbl.session ? tbl.session.hostDeviceId : null,
      hostName: tbl && tbl.session ? tbl.session.hostName : 'Table Lead',
      draftCart: tbl && tbl.session ? (tbl.session.draftCart || []) : [],
      hasActiveOrder: hasActiveOrder,
      activeTicket: hasActiveOrder ? tbl.order : null
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
        hostDeviceId: tbl.session.hostDeviceId,
        hostName: tbl.session.hostName,
        sessionId: tbl.session.sessionId
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        isHost: willBeHost,
        hostDeviceId: tbl.session.hostDeviceId,
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
          order: null
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
      broadcastEvent({ type: 'TABLES_UPDATED', tables: db.tables, sections: db.sections });
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
        broadcastEvent({ type: 'TABLES_UPDATED', tables: db.tables });
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
    broadcastEvent({ type: 'TABLES_UPDATED', tables: db.tables });
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

      const targetRestId = data.restaurantId === 'rest-dera-01' ? 'REST-001' : (data.restaurantId || 'REST-001');

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
        const oldPrice = db.menu[idx].price;
        db.menu[idx] = { ...db.menu[idx], ...data };
        
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

      const ticket = (db.tickets || []).find(t => 
        t.ticketId === data.ticketId || 
        (tbl && tbl.order && t.ticketId === tbl.order.ticketId) ||
        (t.table === tableStr && t.status !== 'Settled')
      );

      // Recalculate authoritatively to eliminate client-side price tampering
      let authoritativeTotal = 0;
      let authoritativeSubtotal = 0;
      let authoritativeTax = 0;
      let itemsSnapshot = [];

      if (ticket) {
        const recalc = calculateAuthoritativeOrder(ticket, db, ticket.restaurantId);
        authoritativeTotal = recalc.total;
        authoritativeSubtotal = recalc.subtotal;
        authoritativeTax = recalc.tax;
        itemsSnapshot = recalc.items;
      } else {
        authoritativeTotal = Math.max(0, Number(data.total) || 0);
        authoritativeTax = Math.round(authoritativeTotal * 0.05);
        authoritativeSubtotal = authoritativeTotal - authoritativeTax;
        itemsSnapshot = data.items || [];
      }

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

      if (ticket) {
        ticket.status = 'Settled';
        ticket.paymentStatus = 'paid';
        ticket.invoiceNumber = invoiceNumber;
        ticket.settledBy = auth.name;
        ticket.settledAt = new Date().toISOString();
        ticket.total = authoritativeTotal;
        ticket.subtotal = authoritativeSubtotal;
        ticket.tax = authoritativeTax;
      }

      if (tbl) {
        tbl.status = 'vacant';
        tbl.order = null;
        tbl.session = null;
      }

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

      // Verify Authorization: Manager PIN or Admin Token
      const rest = (db.restaurants || []).find(r => r.id === ticket.restaurantId) || (db.restaurants && db.restaurants[0]) || {};
      const validPin = rest.managerPin || db.managerPin || '7788';

      const isAuthorizedByPin = pin && pin === validPin;
      const isAuthorizedByToken = auth && ['restaurant_admin', 'super_admin'].includes(auth.role);

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
      ticket.status = 'Voided';
      ticket.voidReason = reason;
      ticket.voidedBy = actor;
      ticket.voidedAt = new Date().toISOString();

      // Free table if this ticket was seated there
      const tableStr = (ticket.table || '').trim();
      const tNum = tableStr.replace('Table ', '').padStart(2, '0');
      const tbl = (db.tables || []).find(t => t.id === tNum || (tableStr && t.name.toLowerCase() === tableStr.toLowerCase()) || (t.order && t.order.ticketId === ticketId));
      if (tbl && tbl.order && tbl.order.ticketId === ticketId) {
        tbl.status = 'vacant';
        tbl.order = null;
        tbl.session = null;
      }

      logAuditEvent(db, 'ORDER_VOIDED', {
        ticketId: ticketId,
        table: ticket.table,
        amount: ticket.total,
        reason: reason,
        authorizedBy: actor
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
      res.end(JSON.stringify({ ok: true, message: `Order ${ticketId} successfully voided.`, ticket: ticket }));
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
        const tNum = (data.table || '04').toString().padStart(2, '0');
        const tableStr = `Table ${tNum}`;
        const db = readDb();

        if (db.tickets) {
          db.tickets = db.tickets.map(t => {
            if ((t.table === tableStr || t.table === `Table ${parseInt(tNum, 10)}` || t.table === tNum) && t.status !== 'Settled') {
              return { ...t, status: 'Settled' };
            }
            return t;
          });
        }

        if (db.tables) {
          const tbl = db.tables.find(t => t.id === tNum || t.name === tableStr);
          if (tbl) {
            tbl.status = 'available';
            tbl.order = null;
            tbl.session = null;
          }
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

        if (eventData.type === 'NEW_ORDER' && eventData.order) {
          const restId = eventData.order.restaurantId || 'rest-dera-01';
          let tableStr = (eventData.order.table || eventData.table || '').trim();
          if (!tableStr && eventData.order.ticketId) {
            const existingTkt = (db.tickets || []).find(t => t.ticketId === eventData.order.ticketId);
            if (existingTkt && existingTkt.table) {
              tableStr = existingTkt.table.trim();
            }
          }
          eventData.order.table = tableStr;
          eventData.table = tableStr;
          const tNum = tableStr.replace('Table ', '').padStart(2, '0');
          let tbl = (db.tables || []).find(t => t.id === tNum || (tableStr && t.name && t.name.toLowerCase() === tableStr.toLowerCase()) || t.id === tableStr);
          const hasActiveOrder = Boolean(tbl && tbl.order && tbl.order.ticketId && tbl.order.status !== 'Settled');
          const senderDeviceId = (eventData.senderDeviceId || eventData.order.senderDeviceId || '').trim();

          // Enforce Host-only submission for INITIAL order
          if (!hasActiveOrder && tbl && tbl.session && tbl.session.hostDeviceId && senderDeviceId && senderDeviceId !== tbl.session.hostDeviceId) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: `Only the Table Host (${tbl.session.hostName || 'Table Lead'}) can submit the initial order. Dishes remain in the shared cart for the Host to fire.`,
              isHost: false,
              hostName: tbl.session.hostName
            }));
            return;
          }

          // SERVER-AUTHORITATIVE RECALCULATION
          const authoritative = calculateAuthoritativeOrder(eventData.order, db, restId);
          eventData.order.items = authoritative.items;
          eventData.order.subtotal = authoritative.subtotal;
          eventData.order.tax = authoritative.tax;
          eventData.order.serviceCharge = authoritative.serviceCharge;
          eventData.order.charges = authoritative.charges;
          eventData.order.total = authoritative.total;
          eventData.table = eventData.order.table || tableStr;

          // Hierarchy Auto-assignment: assign waiter if not already assigned
          if (!eventData.order.assignedWaiterId) {
            const assigned = autoAssignWaiter(db, restId);
            eventData.order.assignedWaiterId = assigned.id;
            eventData.order.assignedWaiterName = assigned.name;
          }

          const existingIdx = db.tickets.findIndex(t => t.ticketId === eventData.order.ticketId);
          if (existingIdx >= 0) {
            db.tickets[existingIdx] = eventData.order;
          } else {
            db.tickets.unshift(eventData.order);
          }

          if (!tbl && tNum && tNum !== '00') {
            tbl = {
              id: tNum,
              name: tableStr || `Table ${tNum}`,
              zone: 'Main Dining',
              capacity: 4,
              shape: 'square',
              x: 50,
              y: 50,
              status: 'dining',
              order: null
            };
            db.tables.push(tbl);
          }
          if (tbl) {
            tbl.status = 'dining';
            tbl.order = {
              ticketId: eventData.order.ticketId,
              table: tableStr || eventData.order.table || tbl.name,
              guest: eventData.order.guest,
              time: eventData.order.time,
              total: eventData.order.total,
              subtotal: eventData.order.subtotal,
              tax: eventData.order.tax,
              serviceCharge: eventData.order.serviceCharge,
              charges: eventData.order.charges,
              payment: eventData.order.payment,
              assignedWaiter: eventData.order.assignedWaiterName,
              items: eventData.order.items,
              status: eventData.order.status || 'New'
            };
            if (tbl.session) {
              tbl.session.draftCart = [];
            }
          }

          logAuditEvent(db, 'ORDER_CREATED', {
            ticketId: eventData.order.ticketId,
            table: eventData.order.table,
            total: authoritative.total,
            itemsCount: authoritative.items.length,
            assignedWaiter: eventData.order.assignedWaiterName
          }, eventData.order.guest || 'Customer', restId);

          writeDb(db);
        } else if (eventData.type === 'STATUS_UPDATE') {
          const t = db.tickets.find(x => x.ticketId === eventData.ticketId);
          if (t) {
            t.status = eventData.status;
          }
          const tNum = (eventData.table || '').replace('Table ', '').padStart(2, '0');
          const tbl = db.tables.find(x => x.id === tNum || (x.order && x.order.ticketId === eventData.ticketId));
          if (tbl && tbl.order) {
            tbl.order.status = eventData.status;
          }
          writeDb(db);
        } else if (eventData.type === 'SERVICE_BELL') {
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
          db.soldOut = eventData.soldOutList || [];
          writeDb(db);
        }

        broadcastEvent(eventData);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, order: eventData.order }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Full DB Read Endpoint (Sanitized to prevent credential theft)
  if (pathname === '/api/db' && req.method === 'GET') {
    const auth = getRequestAuth(req);
    const db = readDb();
    if (auth && auth.role === 'super_admin') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(db));
      return;
    }

    // Strip sensitive passwords & credentials for non-superadmin clients
    const sanitized = JSON.parse(JSON.stringify(db));
    delete sanitized.superAdmin;
    delete sanitized.managerPin;
    if (sanitized.restaurants) {
      sanitized.restaurants.forEach(r => {
        if (r.credentials) r.credentials = { email: r.credentials.email, password: '***' };
        delete r.managerPin;
      });
    }
    if (sanitized.staff) {
      sanitized.staff.forEach(s => {
        s.password = '***';
      });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(sanitized));
    return;
  }

  // Static File Serving
  let filePath = pathname === '/' ? '/hub.html' : pathname;
  let safePath = path.normalize(path.join(__dirname, filePath));

  if (!safePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

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
  console.log('LOCAL NETWORK ACCESS (MOBILE): http://192.168.1.13:' + PORT);
});
