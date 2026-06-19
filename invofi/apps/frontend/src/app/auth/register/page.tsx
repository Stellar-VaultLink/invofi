'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Building2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { signUpWithEmail } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import type { UserRole } from '@/types';

const schema = z.object({
  displayName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type FormValues = z.infer<typeof schema>;

const ROLES: { id: UserRole; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  {
    id: 'business',
    label: 'Business',
    description: 'I want to tokenize invoices and get financing',
    icon: Building2,
  },
  {
    id: 'lender',
    label: 'Lender / Investor',
    description: 'I want to finance invoices and earn yield',
    icon: TrendingUp,
  },
];

export default function RegisterPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<UserRole>((params.get('role') as UserRole) ?? 'business');

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      await signUpWithEmail(values.email, values.password, role, values.displayName);
      toast({
        title: 'Account created!',
        description: 'Check your email to verify your account, then sign in.',
      });
      router.push('/auth/login');
    } catch (err: unknown) {
      toast({
        title: 'Registration failed',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12 bg-gray-50">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="text-gray-500 mt-1">Join InvoFi and start financing invoices on-chain</p>
        </div>

        {/* Role picker */}
        <div className="grid grid-cols-2 gap-3">
          {ROLES.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRole(r.id)}
              className={cn(
                'p-4 rounded-xl border-2 text-left transition-all',
                role === r.id
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300',
              )}
            >
              <r.icon className={cn('h-5 w-5 mb-2', role === r.id ? 'text-blue-600' : 'text-gray-400')} />
              <p className={cn('font-semibold text-sm', role === r.id ? 'text-blue-700' : 'text-gray-700')}>
                {r.label}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 leading-tight">{r.description}</p>
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="displayName">Full name / Company name</Label>
                <Input id="displayName" placeholder="Acme Corp" {...register('displayName')} />
                {errors.displayName && <p className="text-xs text-red-500">{errors.displayName.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@company.com" {...register('email')} />
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="••••••••" {...register('password')} />
                {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input id="confirmPassword" type="password" placeholder="••••••••" {...register('confirmPassword')} />
                {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Account as {role === 'business' ? 'Business' : 'Lender'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-blue-600 hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
