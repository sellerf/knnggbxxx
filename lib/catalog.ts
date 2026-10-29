export type Category = 'Robux';
export type ProductVariant = { size: string; price: number };
export type Product = { id: string; name: string; brand: string; brandIcon: string; category: Category; price: number; oldPrice: number; image: string; badge?: string; detail: string; rating: string; variants?: ProductVariant[]; baseProductId?: string; selectedVariant?: string };

export const categories: { name: Category; icon: string; image: string }[] = [
  { name: 'Robux', icon: '◆', image: '/robux/kingbux-800.svg' },
];

const packages = [
  { amount: 180, price: 7.9, oldPrice: 12, badge: 'Bom custo' },
  { amount: 400, price: 15, oldPrice: 22, badge: 'Popular' },
  { amount: 800, price: 22.9, oldPrice: 40, badge: 'Recomendado' },
  { amount: 1000, price: 26.9, oldPrice: 50, badge: 'Melhor custo' },
  { amount: 2000, price: 49.9, oldPrice: 100, badge: 'Mega' },
  { amount: 3000, price: 69.9, oldPrice: 150, badge: 'Super' },
  { amount: 5000, price: 99.9, oldPrice: 250, badge: 'Top' },
];

export const products: Product[] = packages.map(({ amount, price, oldPrice, badge }) => ({
  id: `robux-${amount}`,
  name: `Pacote ${amount.toLocaleString('pt-BR')} Robux`,
  brand: 'KingBux',
  brandIcon: 'robux',
  category: 'Robux',
  price,
  oldPrice,
  image: '/robux/robux-package.png',
  badge,
  detail: `Pacote digital de ${amount.toLocaleString('pt-BR')} Robux para sua conta Roblox. Informe apenas seu nome de usuário Roblox e seu e-mail; nunca pedimos sua senha.`,
  rating: '',
}));

export const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
