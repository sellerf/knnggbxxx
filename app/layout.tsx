import type { Metadata, Viewport } from 'next';
import './styles.css';
export const metadata: Metadata = { title: 'KingBux | Robux para jogar do seu jeito', description: 'Pacotes digitais de Robux para sua conta Roblox.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body>{children}</body></html>; }
