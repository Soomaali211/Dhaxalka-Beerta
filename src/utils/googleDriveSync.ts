import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

/**
 * OAuth scopes configured via `set_up_oauth` (`drive.file` = least-privilege per-app Drive files).
 */
export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({ prompt: 'select_account' });

// Flag indicating active sign-in flow
let isSigningIn = false;
// Strictly cache the OAuth access token IN MEMORY ONLY (never localStorage or sessionStorage).
let cachedAccessToken: string | null = null;

export interface GoogleDriveBackupFileItem {
  id: string;
  name: string;
  modifiedTime: string;
  sizeBytes: number;
  casesCount: number | null;
  backupKind: 'all_cases' | 'single_case' | 'unknown';
  caseRef: string | null;
}

export type DriveBackupFileMetadata = GoogleDriveBackupFileItem;
export type GoogleAccountProfile = Pick<User, 'uid' | 'displayName' | 'email' | 'photoURL'>;

/**
 * Initialize Firebase Auth state listener. Clears cached in-memory token on sign-out.
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (userWithoutToken?: User | null) => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure(user);
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure(null);
    }
  });
};

/**
 * Trigger Google Sign-In popup and cache the Drive OAuth access token in memory.
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Lama helin ogolaanshaha Google Drive (Access Token). Fadlan mar kale isku day.');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: unknown) {
    console.error('Google Sign-In error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getCurrentAuthUser = (): User | null => {
  return auth.currentUser;
};

export const logout = async (): Promise<void> => {
  await auth.signOut();
  cachedAccessToken = null;
};

async function requireValidToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('AUTH_REQUIRED');
  }
  return token;
}

function handleDriveHttpError(status: number, bodyText: string): never {
  if (status === 401 || status === 403) {
    cachedAccessToken = null;
    throw new Error('AUTH_REQUIRED');
  }
  let apiMessage = bodyText;
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed?.error?.message) {
      apiMessage = parsed.error.message;
    }
  } catch {
    // keep raw text
  }
  throw new Error(`Google Drive (${status}): ${apiMessage}`);
}

/**
 * Lists JSON backup & case files created by this app in the user's Google Drive.
 */
export async function listDriveBackupFiles(): Promise<GoogleDriveBackupFileItem[]> {
  const token = await requireValidToken();
  const q = "trashed = false and mimeType = 'application/json'";
  const fields = 'files(id,name,modifiedTime,size,appProperties)';
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    q
  )}&fields=${encodeURIComponent(fields)}&orderBy=${encodeURIComponent(
    'modifiedTime desc'
  )}&pageSize=30`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    handleDriveHttpError(res.status, await res.text());
  }

  const data = (await res.json()) as {
    files?: {
      id: string;
      name: string;
      modifiedTime?: string;
      size?: string;
      appProperties?: Record<string, string>;
    }[];
  };

  return (data.files || []).map((f) => {
    const rawCount = f.appProperties?.casesCount ? Number(f.appProperties.casesCount) : null;
    const kindRaw = f.appProperties?.backupKind;
    const backupKind: GoogleDriveBackupFileItem['backupKind'] =
      kindRaw === 'all_cases' || kindRaw === 'single_case' ? kindRaw : 'unknown';

    return {
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime || new Date().toISOString(),
      sizeBytes: f.size ? Number(f.size) || 0 : 0,
      casesCount: rawCount !== null && Number.isFinite(rawCount) ? rawCount : null,
      backupKind,
      caseRef: f.appProperties?.caseRef || null,
    };
  });
}

function buildMultipartDriveBody(
  metadata: Record<string, unknown>,
  jsonContent: string,
  boundary: string
): string {
  return (
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${jsonContent}\r\n` +
    `--${boundary}--`
  );
}

/**
 * Creates a brand-new JSON backup file in the user's Google Drive (`drive.file` scope).
 */
export async function createDriveBackupFile(params: {
  fileName: string;
  jsonContent: string;
  casesCount: number;
  backupKind: 'all_cases' | 'single_case';
  caseRef?: string;
}): Promise<GoogleDriveBackupFileItem> {
  const token = await requireValidToken();
  const boundary = `beerta_dhaxalka_${Date.now().toString(36)}`;
  const metadata = {
    name: params.fileName,
    mimeType: 'application/json',
    description: 'Kaydka Kiisaska Beerta & Dhaxalka (GIS Faraid Backup)',
    appProperties: {
      appName: 'BeertaDhaxalkaGIS',
      casesCount: String(params.casesCount),
      backupKind: params.backupKind,
      ...(params.caseRef ? { caseRef: params.caseRef } : {}),
    },
  };

  const body = buildMultipartDriveBody(metadata, params.jsonContent, boundary);
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size,appProperties',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    handleDriveHttpError(res.status, await res.text());
  }

  const created = (await res.json()) as {
    id: string;
    name: string;
    modifiedTime?: string;
    size?: string;
    appProperties?: Record<string, string>;
  };

  return {
    id: created.id,
    name: created.name,
    modifiedTime: created.modifiedTime || new Date().toISOString(),
    sizeBytes: created.size ? Number(created.size) || 0 : params.jsonContent.length,
    casesCount: params.casesCount,
    backupKind: params.backupKind,
    caseRef: params.caseRef || null,
  };
}

/**
 * Updates/overwrites an existing Google Drive backup file by ID.
 * IMPORTANT: Callers MUST display an explicit user confirmation modal before invoking this function!
 */
export async function overwriteDriveBackupFile(params: {
  fileId: string;
  fileName: string;
  jsonContent: string;
  casesCount: number;
  backupKind: 'all_cases' | 'single_case';
  caseRef?: string;
}): Promise<GoogleDriveBackupFileItem> {
  const token = await requireValidToken();
  const boundary = `beerta_dhaxalka_upd_${Date.now().toString(36)}`;
  const metadata = {
    name: params.fileName,
    mimeType: 'application/json',
    appProperties: {
      appName: 'BeertaDhaxalkaGIS',
      casesCount: String(params.casesCount),
      backupKind: params.backupKind,
      ...(params.caseRef ? { caseRef: params.caseRef } : {}),
    },
  };

  const body = buildMultipartDriveBody(metadata, params.jsonContent, boundary);
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
      params.fileId
    )}?uploadType=multipart&fields=id,name,modifiedTime,size,appProperties`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    handleDriveHttpError(res.status, await res.text());
  }

  const updated = (await res.json()) as {
    id: string;
    name: string;
    modifiedTime?: string;
    size?: string;
  };

  return {
    id: updated.id,
    name: updated.name,
    modifiedTime: updated.modifiedTime || new Date().toISOString(),
    sizeBytes: updated.size ? Number(updated.size) || 0 : params.jsonContent.length,
    casesCount: params.casesCount,
    backupKind: params.backupKind,
    caseRef: params.caseRef || null,
  };
}

/**
 * Downloads the JSON content of a Google Drive backup file.
 */
export async function downloadDriveBackupFileContent(fileId: string): Promise<string> {
  const token = await requireValidToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    handleDriveHttpError(res.status, await res.text());
  }

  return await res.text();
}

/**
 * Permanently deletes an app-created backup file from Google Drive.
 * IMPORTANT: Callers MUST display an explicit user confirmation modal before invoking this function!
 */
export async function deleteDriveBackupFile(fileId: string): Promise<void> {
  const token = await requireValidToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok && res.status !== 204) {
    handleDriveHttpError(res.status, await res.text());
  }
}
