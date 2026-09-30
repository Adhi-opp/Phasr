"use server";

import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const registerRoleSchema = z.enum(["HOMEOWNER", "DEALER"]);

// Public by design: registration and sign-in cannot require a session. They
// are held instead to strict schemas. registerRoleSchema is the guard that
// matters most — ADMIN is not a value a caller can ask for, whatever the
// payload says. Emails cap at 254 (RFC 5321); passwords at 72, bcrypt's limit.
const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional().or(z.literal("")),
    email: z.string().max(254).email(),
    password: z.string().min(8).max(72),
    confirmPassword: z.string().min(8).max(72),
    role: registerRoleSchema.optional(),
  })
  .strict()
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

const loginSchema = z
  .object({
    email: z.string().max(254).email(),
    password: z.string().min(1).max(72),
  })
  .strict();

export type RegisterUserInput = z.infer<typeof registerSchema>;
export type LoginUserInput = z.infer<typeof loginSchema>;

function formatZodIssues(issues: z.ZodIssue[]): string {
  const cleanMessages = issues.map((issue) => issue.message).filter(Boolean);
  return cleanMessages.join("; ");
}

export type RegisterUserResult =
  | {
      success: true;
      userId: string;
    }
  | {
      success: false;
      errorCode: "VALIDATION_ERROR" | "EMAIL_TAKEN" | "INTERNAL_ERROR";
      error: string;
    };

export type LoginUserResult =
  | {
      success: true;
    }
  | {
      success: false;
      errorCode: "VALIDATION_ERROR" | "INVALID_CREDENTIALS" | "INTERNAL_ERROR";
      error: string;
    };

export async function registerUser(data: RegisterUserInput): Promise<RegisterUserResult> {
  const parsed = registerSchema.safeParse(data);
  if (!parsed.success) {
    const message = formatZodIssues(parsed.error.issues);
    return {
      success: false,
      errorCode: "VALIDATION_ERROR",
      error: message,
    };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const name = parsed.data.name?.trim() ? parsed.data.name.trim() : null;
  const role = parsed.data.role ?? "HOMEOWNER";

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    if (existingUser) {
      return {
        success: false,
        errorCode: "EMAIL_TAKEN",
        error: "An account with this email already exists.",
      };
    }

    const passwordHash = await hash(parsed.data.password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: passwordHash,
        role,
      },
      select: {
        id: true,
      },
    });

    return {
      success: true,
      userId: user.id,
    };
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    const isDbError =
      raw.includes("FATAL") ||
      raw.includes("connect") ||
      raw.includes("Tenant") ||
      raw.includes("ECONNREFUSED");

    return {
      success: false,
      errorCode: "INTERNAL_ERROR",
      error: isDbError
        ? "Unable to reach the database. Please try again in a moment."
        : "Unexpected registration error. Please try again.",
    };
  }
}

export async function loginUser(data: LoginUserInput): Promise<LoginUserResult> {
  const parsed = loginSchema.safeParse(data);
  if (!parsed.success) {
    const message = formatZodIssues(parsed.error.issues);
    return {
      success: false,
      errorCode: "VALIDATION_ERROR",
      error: message,
    };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email.trim().toLowerCase(),
      password: parsed.data.password,
      redirect: false,
    });
    return { success: true };
  } catch (error) {
    // Next.js internal errors (redirect, notFound) carry a `digest` — always re-throw
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }

    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return {
          success: false,
          errorCode: "INVALID_CREDENTIALS",
          error: "Invalid email or password.",
        };
      }

      return {
        success: false,
        errorCode: "INTERNAL_ERROR",
        error: "Authentication failed. Please try again.",
      };
    }

    // DB or network errors — show a friendly message
    const raw = error instanceof Error ? error.message : "";
    const isDbError =
      raw.includes("FATAL") ||
      raw.includes("connect") ||
      raw.includes("Tenant") ||
      raw.includes("ECONNREFUSED");

    return {
      success: false,
      errorCode: "INTERNAL_ERROR",
      error: isDbError
        ? "Unable to reach the database. Please try again in a moment."
        : "Authentication failed. Please try again.",
    };
  }
}
