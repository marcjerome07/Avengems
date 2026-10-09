// Demo accounts for presentations. These credentials are shown on the Login page.
// The passwords below exist only so the mock auth service can seed hashed records;
// they are never written to localStorage in plain text.
export const demoUsers = [
  {
    id: 'u-customer',
    name: 'Bea Santos',
    email: 'customer@avengems.demo',
    password: 'Customer123!',
    role: 'customer',
    phone: '0917 555 0123',
    verified: true,
    createdAt: '2026-03-14T09:00:00.000Z',
    addresses: [
      {
        id: 'addr-1',
        label: 'Home',
        fullName: 'Bea Santos',
        phone: '0917 555 0123',
        address: '28 Mabini Street, Brgy. San Antonio',
        city: 'Pasig City',
        province: 'Metro Manila',
        postalCode: '1600',
        isDefault: true,
      },
      {
        id: 'addr-2',
        label: 'Office',
        fullName: 'Bea Santos',
        phone: '0917 555 0123',
        address: '12F One Corporate Centre, Julia Vargas Ave.',
        city: 'Pasig City',
        province: 'Metro Manila',
        postalCode: '1605',
        isDefault: false,
      },
    ],
  },
  {
    id: 'u-admin',
    name: 'Avengems Admin',
    email: 'admin@avengems.demo',
    password: 'Admin123!',
    role: 'admin',
    phone: '0917 555 0100',
    verified: true,
    createdAt: '2026-01-05T09:00:00.000Z',
    addresses: [],
  },
];
