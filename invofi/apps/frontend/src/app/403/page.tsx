import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function Forbidden() {
  const t = useTranslations('Errors.forbidden');

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center text-center px-4">
      <p className="text-6xl font-bold text-blue-600 mb-4">403</p>
      <h1 className="text-2xl font-bold text-gray-900 mb-2 dark:text-gray-50">{t('title')}</h1>
      <p className="text-gray-500 mb-8 max-w-sm dark:text-gray-400">{t('description')}</p>
      <Button asChild>
        <Link href="/">{t('backHome')}</Link>
      </Button>
    </div>
  );
}
