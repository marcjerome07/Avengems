// Sample orders for the demo customer and the admin dashboard.
// Customer names below are fictional store data, not team members.
import { products } from './products';
import { config } from './config';

const CUSTOMERS = {
  bea: {
    userId: 'u-customer',
    name: 'Bea Santos',
    email: 'customer@avengems.demo',
    phone: '0917 555 0123',
    city: 'Pasig City',
    province: 'Metro Manila',
    postalCode: '1600',
    address: '28 Mabini Street, Brgy. San Antonio',
  },
  miguel: {
    userId: 'c-101',
    name: 'Miguel Reyes',
    email: 'miguel.reyes@example.com',
    phone: '0918 222 4410',
    city: 'Quezon City',
    province: 'Metro Manila',
    postalCode: '1104',
    address: '45 Maginhawa Street',
  },
  andrea: {
    userId: 'c-102',
    name: 'Andrea Cruz',
    email: 'andrea.cruz@example.com',
    phone: '0927 411 9083',
    city: 'Cebu City',
    province: 'Cebu',
    postalCode: '6000',
    address: '9 Gorordo Avenue',
  },
  paolo: {
    userId: 'c-103',
    name: 'Paolo Garcia',
    email: 'paolo.garcia@example.com',
    phone: '0995 310 2217',
    city: 'Davao City',
    province: 'Davao del Sur',
    postalCode: '8000',
    address: '120 J.P. Laurel Avenue',
  },
  isabel: {
    userId: 'c-104',
    name: 'Isabel Mendoza',
    email: 'isabel.mendoza@example.com',
    phone: '0906 774 1290',
    city: 'Makati City',
    province: 'Metro Manila',
    postalCode: '1209',
    address: '18 Salcedo Street, Legaspi Village',
  },
  carlo: {
    userId: 'c-105',
    name: 'Carlo Villanueva',
    email: 'carlo.v@example.com',
    phone: '0919 650 3381',
    city: 'Iloilo City',
    province: 'Iloilo',
    postalCode: '5000',
    address: '33 Diversion Road, Mandurriao',
  },
  trisha: {
    userId: 'c-106',
    name: 'Trisha Ramos',
    email: 'trisha.ramos@example.com',
    phone: '0917 908 4456',
    city: 'Baguio City',
    province: 'Benguet',
    postalCode: '2600',
    address: '7 Session Road',
  },
  joaquin: {
    userId: 'c-107',
    name: 'Joaquin Torres',
    email: 'joaquin.torres@example.com',
    phone: '0928 117 5562',
    city: 'Taguig City',
    province: 'Metro Manila',
    postalCode: '1634',
    address: '5th Avenue, Bonifacio Global City',
  },
  kristine: {
    userId: 'c-108',
    name: 'Kristine Bautista',
    email: 'kbautista@example.com',
    phone: '0935 442 7781',
    city: 'Batangas City',
    province: 'Batangas',
    postalCode: '4200',
    address: '61 P. Burgos Street',
  },
  nathan: {
    userId: 'c-109',
    name: 'Nathan Lim',
    email: 'nathan.lim@example.com',
    phone: '0917 330 9902',
    city: 'Manila',
    province: 'Metro Manila',
    postalCode: '1006',
    address: '210 Ongpin Street, Binondo',
  },
  patricia: {
    userId: 'c-110',
    name: 'Patricia Aquino',
    email: 'pat.aquino@example.com',
    phone: '0998 554 0137',
    city: 'Antipolo City',
    province: 'Rizal',
    postalCode: '1870',
    address: '14 Sumulong Highway',
  },
  rafael: {
    userId: 'c-111',
    name: 'Rafael Navarro',
    email: 'rafael.navarro@example.com',
    phone: '0916 287 6634',
    city: 'Bacolod City',
    province: 'Negros Occidental',
    postalCode: '6100',
    address: '88 Lacson Street',
  },
};

// [orderNo, customerKey, ISO date, status, payment, [[productId, qty, { color?, size? }]]]
const SPECS = [
  // Demo customer (Bea Santos)
  [
    'AVG-2026-10412',
    'bea',
    '2026-10-05T10:24:00',
    'Processing',
    'gcash',
    [
      ['p-06', 1],
      ['p-20', 1],
    ],
  ],
  ['AVG-2026-10377', 'bea', '2026-09-27T14:02:00', 'Shipped', 'card', [['p-01', 1, { size: 'US 6' }]]],
  ['AVG-2026-10251', 'bea', '2026-09-03T09:41:00', 'Delivered', 'cod', [['p-11', 2]]],
  [
    'AVG-2026-10108',
    'bea',
    '2026-08-12T19:15:00',
    'Delivered',
    'maya',
    [
      ['p-14', 1],
      ['p-16', 1],
    ],
  ],
  ['AVG-2026-10023', 'bea', '2026-07-21T11:30:00', 'Cancelled', 'gcash', [['p-22', 1]]],
  [
    'AVG-2026-09874',
    'bea',
    '2026-06-18T16:48:00',
    'Delivered',
    'card',
    [
      ['p-08', 1],
      ['p-05', 1],
    ],
  ],
  ['AVG-2026-10431', 'bea', '2026-10-08T08:12:00', 'Pending', 'cod', [['p-21', 1, { size: 'US 8' }]]],

  // Other customers (admin dashboard)
  [
    'AVG-2026-10429',
    'miguel',
    '2026-10-07T21:05:00',
    'Pending',
    'gcash',
    [
      ['p-09', 1],
      ['p-10', 1],
    ],
  ],
  [
    'AVG-2026-10425',
    'andrea',
    '2026-10-07T13:44:00',
    'Processing',
    'maya',
    [
      ['p-01', 1],
      ['p-06', 1],
      ['p-09', 1],
      ['p-14', 1],
      ['p-20', 1],
      ['p-22', 1],
    ],
  ],
  ['AVG-2026-10418', 'paolo', '2026-10-06T10:10:00', 'Pending', 'cod', [['p-24', 2]]],
  ['AVG-2026-10398', 'isabel', '2026-10-02T17:36:00', 'Shipped', 'card', [['p-22', 1, { color: 'Purple' }]]],
  [
    'AVG-2026-10366',
    'carlo',
    '2026-09-25T12:20:00',
    'Delivered',
    'gcash',
    [
      ['p-17', 1],
      ['p-23', 1],
    ],
  ],
  [
    'AVG-2026-10340',
    'trisha',
    '2026-09-19T15:52:00',
    'Delivered',
    'maya',
    [
      ['p-06', 1],
      ['p-07', 1],
      ['p-08', 1],
    ],
  ],
  ['AVG-2026-10302', 'joaquin', '2026-09-11T09:05:00', 'Delivered', 'card', [['p-01', 1]]],
  ['AVG-2026-10277', 'kristine', '2026-09-07T20:41:00', 'Cancelled', 'cod', [['p-15', 1]]],
  [
    'AVG-2026-10215',
    'nathan',
    '2026-08-28T11:18:00',
    'Delivered',
    'gcash',
    [
      ['p-13', 1, { size: 'US 9', color: 'Red' }],
      ['p-16', 1],
    ],
  ],
  ['AVG-2026-10164', 'patricia', '2026-08-19T14:27:00', 'Delivered', 'maya', [['p-20', 2]]],
  [
    'AVG-2026-10132',
    'rafael',
    '2026-08-15T18:09:00',
    'Delivered',
    'card',
    [
      ['p-11', 1],
      ['p-21', 1],
    ],
  ],
  ['AVG-2026-10071', 'miguel', '2026-07-30T10:44:00', 'Delivered', 'gcash', [['p-14', 1]]],
  [
    'AVG-2026-10044',
    'andrea',
    '2026-07-24T13:13:00',
    'Delivered',
    'cod',
    [
      ['p-04', 1],
      ['p-12', 1],
    ],
  ],
  ['AVG-2026-09991', 'isabel', '2026-07-09T16:30:00', 'Delivered', 'card', [['p-06', 2]]],
  ['AVG-2026-09952', 'paolo', '2026-07-01T09:58:00', 'Delivered', 'gcash', [['p-09', 1]]],
  [
    'AVG-2026-09903',
    'trisha',
    '2026-06-22T19:20:00',
    'Delivered',
    'maya',
    [
      ['p-02', 1],
      ['p-18', 1],
    ],
  ],
  ['AVG-2026-09860', 'carlo', '2026-06-14T12:02:00', 'Cancelled', 'cod', [['p-03', 1]]],
  [
    'AVG-2026-09811',
    'joaquin',
    '2026-06-05T08:47:00',
    'Delivered',
    'card',
    [
      ['p-22', 1],
      ['p-23', 1],
    ],
  ],
  [
    'AVG-2026-09774',
    'kristine',
    '2026-05-27T15:15:00',
    'Delivered',
    'gcash',
    [
      ['p-08', 2],
      ['p-24', 1],
    ],
  ],
  [
    'AVG-2026-09735',
    'nathan',
    '2026-05-18T17:38:00',
    'Delivered',
    'maya',
    [
      ['p-01', 1],
      ['p-09', 1],
      ['p-17', 1],
    ],
  ],
  [
    'AVG-2026-09702',
    'rafael',
    '2026-05-09T10:26:00',
    'Delivered',
    'cod',
    [
      ['p-19', 1],
      ['p-11', 1],
    ],
  ],
];

const productById = Object.fromEntries(products.map((p) => [p.id, p]));

function buildItem(productId, quantity, opts = {}) {
  const p = productById[productId];
  const color = opts.color ?? p.color;
  const size = opts.size ?? p.defaultSize;
  const customized = (p.customizable.color && color !== p.color) || (p.customizable.size && size !== p.defaultSize);
  const customizationFee = customized ? p.customizationFee : 0;
  return {
    lineId: `${p.id}|${color}|${size}`,
    productId: p.id,
    slug: p.slug,
    name: p.name,
    type: p.type,
    stone: p.stone,
    color,
    size,
    material: p.material,
    basePrice: p.price,
    customized,
    customizationFee,
    unitPrice: p.price + customizationFee,
    quantity,
    images: p.images,
  };
}

export const demoOrders = SPECS.map(([id, customerKey, date, status, paymentMethod, lines]) => {
  const c = CUSTOMERS[customerKey];
  const items = lines.map(([pid, qty, opts]) => buildItem(pid, qty, opts));
  const subtotal = items.reduce((sum, i) => sum + i.basePrice * i.quantity, 0);
  const customizationTotal = items.reduce((sum, i) => sum + i.customizationFee * i.quantity, 0);
  const merchandise = subtotal + customizationTotal;
  const shippingFee = merchandise >= config.shipping.freeThreshold ? 0 : config.shipping.flatFee;
  return {
    id,
    userId: c.userId,
    createdAt: new Date(`${date}+08:00`).toISOString(),
    status,
    paymentMethod,
    customer: { name: c.name, email: c.email, phone: c.phone },
    shipping: { address: c.address, city: c.city, province: c.province, postalCode: c.postalCode },
    items,
    subtotal,
    customizationTotal,
    shippingFee,
    total: merchandise + shippingFee,
    source: 'demo',
  };
});

// Customers without the demo account, for the admin Customers table.
export const demoCustomers = Object.values(CUSTOMERS).map((c) => ({
  id: c.userId,
  name: c.name,
  email: c.email,
  phone: c.phone,
  city: c.city,
}));
