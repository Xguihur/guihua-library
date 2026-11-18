import mongoose from 'mongoose';
import { cliFailureMessage } from '../config/cli-failure';
import { loadRootEnv } from '../config/runtime';
import { validateDevelopmentDatabaseUri } from '../config/test-database';

/**
 * Repeatable, local-development-only M1 -> M2 account migration.
 *
 * It checks case-normalization conflicts first and stops without touching data if
 * any exist. It backfills usernameNormalized and creates the new indexes, but it
 * never auto-syncs indexes or drops a database/collection. Removing the old
 * username/email unique indexes is an explicit maintainer decision.
 */
async function main(): Promise<void> {
  loadRootEnv();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('db:migrate refuses to run with NODE_ENV=production.');
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required for db:migrate.');
  const target = validateDevelopmentDatabaseUri(uri);

  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  try {
    const db = connection.db;
    if (!db) throw new Error('Database handle is unavailable.');
    const users = db.collection('users');

    const seen = new Map<string, string>();
    const conflicts: string[] = [];
    for await (const user of users.find({}, { projection: { _id: 1, username: 1, email: 1 } })) {
      const id = String(user._id);
      const normalized = String(user.username ?? '').trim().toLowerCase();
      const previous = seen.get(normalized);
      if (previous && previous !== id) {
        // Desensitized: only the normalized shape and id prefixes are shown.
        conflicts.push(`username ${normalized.slice(0, 2)}*** (${id.slice(0, 8)}…/${previous.slice(0, 8)}…)`);
      } else {
        seen.set(normalized, id);
      }
    }
    if (conflicts.length > 0) {
      throw new Error(
        `Stopped: ${conflicts.length} username normalization conflict(s) found: ${conflicts.slice(0, 5).join(', ')}. ` +
          'Resolve manually; no username was changed and no account was merged.',
      );
    }

    // Email duplicates (among non-null values) must also be resolved before a
    // partial unique index can be created; report desensitized shapes only.
    const seenEmails = new Map<string, string>();
    const emailConflicts: string[] = [];
    for await (const user of users.find({ email: { $type: 'string' } }, { projection: { _id: 1, email: 1 } })) {
      const normalized = String(user.email ?? '').trim().toLowerCase();
      const id = String(user._id);
      const previous = seenEmails.get(normalized);
      if (previous && previous !== id) {
        const domain = normalized.split('@')[1] ?? '';
        emailConflicts.push(`email ***@${domain.slice(0, 8)} (${id.slice(0, 8)}…/${previous.slice(0, 8)}…)`);
      } else {
        seenEmails.set(normalized, id);
      }
    }
    if (emailConflicts.length > 0) {
      throw new Error(
        `Stopped: ${emailConflicts.length} email conflict(s) found: ${emailConflicts.slice(0, 5).join(', ')}. ` +
          'Resolve manually; no index was created and no account was merged.',
      );
    }

    // Aggregation-pipeline update copies and normalizes another field's value.
    const backfill = await users.updateMany(
      { $or: [{ usernameNormalized: { $exists: false } }, { usernameNormalized: null }] },
      [{ $set: { usernameNormalized: { $toLower: { $trim: { input: '$username' } } } } }],
    );

    await users.createIndex(
      { usernameNormalized: 1 },
      { unique: true, sparse: true, name: 'users_username_normalized_unique' },
    );
    await users.createIndex(
      { email: 1 },
      { unique: true, partialFilterExpression: { email: { $type: 'string' } }, name: 'users_email_nullable_unique' },
    );
    await db.collection('identities').createIndex(
      { provider: 1, subject: 1 },
      { unique: true, name: 'identities_provider_subject_unique' },
    );
    await db.collection('identities').createIndex(
      { userId: 1, provider: 1 },
      { unique: true, name: 'identities_user_provider_unique' },
    );
    await db.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true, name: 'sessions_token_hash_unique' });
    await db.collection('sessions').createIndex({ userId: 1 }, { name: 'sessions_user_id' });
    await db.collection('sessions').createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: 'sessions_expires_ttl' },
    );
    await db.collection('oauth_states').createIndex(
      { stateHash: 1 },
      { unique: true, name: 'oauth_states_state_hash_unique' },
    );
    await db.collection('oauth_states').createIndex({ oauthCookieHash: 1 }, { name: 'oauth_states_cookie_hash' });
    await db.collection('oauth_states').createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: 'oauth_states_expires_ttl' },
    );
    await db.collection('reauths').createIndex(
      { sessionHash: 1, userId: 1, purpose: 1 },
      { name: 'reauths_session_user_purpose' },
    );
    await db.collection('reauths').createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: 'reauths_expires_ttl' },
    );
    await db.collection('email_challenges').createIndex(
      { tokenHash: 1 },
      { unique: true, name: 'email_challenges_token_hash_unique' },
    );
    await db.collection('email_challenges').createIndex({ userId: 1 }, { name: 'email_challenges_user_id' });
    await db.collection('email_challenges').createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: 'email_challenges_expires_ttl' },
    );

    // Multiple OAuth-only users have email:null. The legacy M1 unique email
    // index treats null as a duplicate and blocks the second such user, so after
    // the string-only partial index exists we drop the ONE known legacy index by
    // its exact name. Unknown indexes are never touched.
    const present = await users.indexes();
    const partialReady = present.some((index) => index.name === 'users_email_nullable_unique');
    if (!partialReady) throw new Error('Stopped: partial email index is missing; legacy index was not dropped.');
    const legacy = present.find((index) => index.name === 'users_email_unique');
    let dropped = 'none';
    if (legacy) {
      await users.dropIndex('users_email_unique');
      dropped = 'users_email_unique';
    }

    console.log(
      `[db:migrate] ${target.database}@${target.host}:${target.port} conflicts=0 email-conflicts=0 ` +
        `normalized=${backfill.matchedCount} new-indexes=15 legacy-email-index-dropped=${dropped}; ` +
        'rollback: recreate users_email_unique manually only after removing all null-email users; ' +
        'no unknown index, collection or database was dropped and no user data was changed',
    );
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(cliFailureMessage('db:migrate', error));
  process.exitCode = 1;
});
