'use client';

import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { InvoiceForm } from '@/components/invoices/InvoiceForm';

export default function NewInvoicePage() {
  const router = useRouter();

  return (
    <AuthGuard>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Create Invoice</h1>
          <p className="text-gray-500 text-sm mt-1">
            Register your invoice on the Stellar blockchain to receive financing offers.
          </p>
        </div>
        <InvoiceForm onSuccess={id => router.push(`/invoices/${id}`)} />
      </div>
    </AuthGuard>
  );
}
