/* Runs once when the dashboard's server starts: trades the one-time sign-in code /web passed
   (RECONIX_WEB_SIGN_IN_CODE, valid for 2 minutes) for the Core API session before it expires. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.RECONIX_WEB_SIGN_IN_CODE) return;
  const { signInWithCode } = await import("./lib/api/sessions");
  await signInWithCode();
}
