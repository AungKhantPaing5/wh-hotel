import type { Metadata } from 'next';
import './style.css';
export const metadata: Metadata = { title: 'WN | A stay to remember', description: 'Book your next stay directly with WN Hotel.' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
