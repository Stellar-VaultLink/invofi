import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Forbidden() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center text-center px-4">
      <p className="text-6xl font-bold text-blue-600 mb-4">403</p>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Access forbidden</h1>
      <p className="text-gray-500 mb-8 max-w-sm">
        You don&rsquo;t have permission to access this resource.
      </p>
      <Button asChild>
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
