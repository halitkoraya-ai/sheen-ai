import * as admin from 'firebase-admin';

export async function verifyToken(token: string): Promise<admin.auth.DecodedIdToken> {
  return admin.auth().verifyIdToken(token);
}
