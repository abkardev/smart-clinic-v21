export function required(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `Environment variable "${name}" is required but not set.\n` +
      `Check your .env.local or deployment environment variables.`
    );
  }
  return val;
}

export function optional(name: string): string | undefined {
  return process.env[name];
}

export function optionalWithDefault(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}
