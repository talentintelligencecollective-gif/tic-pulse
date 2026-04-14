import { z } from "zod";

const ClientEnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
});

export type ClientEnv = z.infer<typeof ClientEnvSchema>;

/** Validates browser env; logs structured issues on failure (non-throwing for softer UX). */
export function parseClientEnv(raw: ImportMetaEnv): ClientEnv | null {
  const result = ClientEnvSchema.safeParse(raw);
  if (!result.success) {
    console.error({
      event: "CLIENT_ENV_INVALID",
      issues: result.error.flatten(),
    });
    return null;
  }
  return result.data;
}
