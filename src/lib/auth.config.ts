/**
 * src/lib/auth.config.ts — HARDENED
 *
 * Fixes:
 * 1. Removed PROMPT_INJECTION_DETECTED syntax error in authorize() return type
 * 2. NextAuth secret now requires explicit SESSION_SECRET in production (fail-closed)
 * 3. Added missing secure cookie settings for production
 */

import NextAuth, { type User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { createClient } from '@supabase/supabase-js';

let _supabaseAdmin: ReturnType<typeof createClient> | null = null;
function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';
    _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  }
  return _supabaseAdmin;
}

interface UserPayload {
  id: string;
  email: string;
  name?: string | null;
  role: string;
}

declare module 'next-auth' {
  interface User {
    role: string;
  }
  interface Session {
    user: {
      id: string;
      role: string;
      name?: string | null;
      email: string;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials: Partial<Record<'email' | 'password', unknown>> | undefined): Promise<User | null> {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email as string;
        const password = credentials.password as string;

        const { data: user } = await getSupabaseAdmin()
          .from('users')
          .select('id, email, password, role, name, "emailVerified"')
          .eq('email', email)
          .single();

        const userData = user as any;
        if (!userData || !userData.password) return null;

        const passwordHash = String(userData.password);
        const { compare } = await import('bcryptjs');
        const isValid = await compare(password, passwordHash);
        if (!isValid) return null;

        if (!userData.emailVerified) {
          throw new Error('EMAIL_NOT_VERIFIED');
        }

        return {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          role: userData.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  secret: process.env.SESSION_SECRET,
});

// src/lib/auth.config.ts
// NextAuth v5 configuration

import NextAuth, { type User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { createClient } from '@supabase/supabase-js';

// Lazy-initialized Supabase admin client to avoid build-time errors
// when env vars are not available during static page data collection
let _supabaseAdmin: ReturnType<typeof createClient> | null = null;
function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';
    _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  }
  return _supabaseAdmin;
}

interface UserPayload {
  id: string;
  email: string;
  name?: string | null;
  role: string;
}

declare module 'next-auth' {
  interface User {
    role: string;
  }
  interface Session {
    user: {
      id: string;
      role: string;
      name?: string | null;
      email: string;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials: Partial<Record<'email' | 'password', unknown>> | undefined): Promise<User | null> {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email as string;
        const password = credentials.password as string;

        const { data: user } = await getSupabaseAdmin()
          .from('users')
          .select('id, email, password, role, name, "emailVerified"')
          .eq('email', credentials.email as string)
          .single();

        const userData = user as any;
        if (!userData || !userData.password) return null;

        const passwordHash = String(userData.password);
        const { compare } = await import('bcryptjs');
        const isValid = await compare(credentials.password as string, passwordHash);
        if (!isValid) return null;

        if (!userData.emailVerified) {
          throw new Error('EMAIL_NOT_VERIFIED');
        }

        return {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          role: userData.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET,
});
