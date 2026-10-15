import type { Metadata } from 'next';
import './style.css';
export const metadata: Metadata = { title: 'WH | A stay to remember', description: 'Book your next stay directly with WH Hotel.' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
