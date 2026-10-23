import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  PTERODACTYL_URL: z.string().url().optional(),
  PTERODACTYL_APPLICATION_KEY: z.string().optional(),
  PTERODACTYL_CLIENT_KEY: z.string().optional(),
  DATABASE_URL: z.string().optional()
});

export const config = envSchema.parse(process.env);
export const pterodactylConfigured = Boolean(
  config.PTERODACTYL_URL && config.PTERODACTYL_APPLICATION_KEY
);
