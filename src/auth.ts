import { compare } from "bcryptjs";
import { type Role } from "@prisma/client";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

// Not .strict(): NextAuth adds its own keys (csrfToken, callbackUrl) to the
// credentials object. Only these two are read.
const credentialsSchema = z.object({
  email: z.string().max(254).email(),
  password: z.string().min(1).max(72),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: {
    strategy: "jwt",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: {
          label: "Email",
          type: "email",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.trim().toLowerCase();
        const password = parsed.data.password;

        const user = await prisma.user.findFirst({
          where: {
            email: {
              equals: email,
              mode: "insensitive",
            },
          },
          select: {
            id: true,
            email: true,
            name: true,
            password: true,
            role: true,
            isActive: true,
          },
        });

        if (!user || !user.password || !user.isActive) return null;

        const isValidPassword = await compare(password, user.password);
        if (!isValidPassword) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isActive: user.isActive,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Populate token on initial sign-in only (not on every request).
      // This avoids a DB round-trip on every page load / sign-out, which
      // caused timeouts on Supabase nano tier.
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: Role }).role;
        token.isActive = (user as { isActive?: boolean }).isActive;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (typeof token.id === "string") {
          session.user.id = token.id;
        }
        if (typeof token.role === "string") {
          session.user.role = token.role as Role;
        }
        if (typeof token.isActive === "boolean") {
          session.user.isActive = token.isActive;
        }
      }

      return session;
    },
  },
});
