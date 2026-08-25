'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Building2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { signUpWithEmail } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import { WalletButton } from '@/components/auth/WalletButton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useWallet } from '@/components/auth/WalletProvider';
import type { UserRole } from '@/types';

const schema = z.object({
  displayName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z
    .string()
    .email('Enter a valid email')
    .refine((email) => !email.toLowerCase().endsWith('@stellar.wallet'), {
      message: 'This email domain is reserved for wallet sign-in.',
    }),
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

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<UserRole>((params.get('role') as UserRole) ?? 'business');
  const { isConnected, isCheckingWallet } = useWallet();

  // Redirect if wallet is already connected.
  useEffect(() => {
    if (!isCheckingWallet && isConnected) {
      router.replace('/dashboard');
    }
  }, [isCheckingWallet, isConnected, router]);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      const result = await signUpWithEmail(values.email, values.password, role, values.displayName);
      if (result.session) {
        // Email confirmation is disabled — user is immediately active
        router.push('/dashboard');
      } else {
        toast({
          title: 'Account created!',
          description: 'Check your email for a confirmation link, then sign in.',
        });
        router.push('/auth/login');
      }
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
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12 bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Create your account</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Join InvoFi and start financing invoices on-chain</p>
        </div>

        {/* Wallet register/sign-in — works without filling a form */}
        <Card className="border-2 border-blue-100 dark:border-blue-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Continue with Wallet</CardTitle>
            <CardDescription>Use Freighter or LOBSTR to sign up instantly — no password needed</CardDescription>
          </CardHeader>
          <CardContent>
            <WalletButton onConnected={() => router.push('/dashboard')} />
          </CardContent>
        </Card>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200 dark:border-gray-700" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-gray-50 dark:bg-gray-950 px-2 text-gray-400 dark:text-gray-500">or create account with email</span>
          </div>
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
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-950'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600',
              )}
            >
              <r.icon className={cn('h-5 w-5 mb-2', role === r.id ? 'text-blue-600' : 'text-gray-400')} />
              <p className={cn('font-semibold text-sm', role === r.id ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300')}>
                {r.label}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{r.description}</p>
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

        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
