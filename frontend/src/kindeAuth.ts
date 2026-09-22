import createKindeClient, { type KindeClient } from "@kinde-oss/kinde-auth-pkce-js";

const KINDE_DOMAIN = "https://urbanflow.kinde.com";
const KINDE_CLIENT_ID = "a31be40b3f8942888c80248974037c78";

let clientPromise: Promise<KindeClient> | null = null;

function getClient(): Promise<KindeClient> {
  if (!clientPromise) {
    clientPromise = createKindeClient({
      client_id: KINDE_CLIENT_ID,
      domain: KINDE_DOMAIN,
      redirect_uri: `${window.location.origin}/app`,
      logout_uri: window.location.origin,
      is_dangerously_use_local_storage: true,
    });
  }
  return clientPromise;
}

export async function isAuthenticated(): Promise<boolean> {
  const client = await getClient();
  return client.isAuthenticated();
}

export async function login(): Promise<void> {
  const client = await getClient();
  await client.login();
}

export async function logout(): Promise<void> {
  const client = await getClient();
  await client.logout();
}
