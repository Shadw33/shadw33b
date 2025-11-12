/**
 * Cleanup script for unconfirmed user accounts
 * Removes users who signed up but never confirmed their email
 * 
 * Run with: npx tsx server/scripts/cleanupUnconfirmedUsers.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// How many days to wait before deleting unconfirmed accounts
const DAYS_BEFORE_CLEANUP = 7;

async function cleanupUnconfirmedUsers() {
  try {
    console.log('[CLEANUP] Starting cleanup of unconfirmed users...');
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DAYS_BEFORE_CLEANUP);
    const cutoffISO = cutoffDate.toISOString();

    console.log(`[CLEANUP] Looking for users created before ${cutoffISO} who never confirmed email...`);

    // Get unconfirmed users older than cutoff date
    // Note: listUsers() returns paginated results, so we need to handle pagination
    let allUsers: any[] = [];
    let page = 1;
    const perPage = 100;
    let hasMore = true;

    while (hasMore) {
      const { data: users, error: fetchError } = await supabase.auth.admin.listUsers({
        page,
        perPage
      });
      
      if (fetchError) {
        throw fetchError;
      }

      if (users?.users && users.users.length > 0) {
        allUsers = allUsers.concat(users.users);
        hasMore = users.users.length === perPage;
        page++;
      } else {
        hasMore = false;
      }
    }

    if (allUsers.length === 0) {
      console.log('[CLEANUP] No users found');
      return;
    }

    const unconfirmedUsers = allUsers.filter(user => {
      const createdBeforeCutoff = new Date(user.created_at) < cutoffDate;
      const neverConfirmed = !user.email_confirmed_at;
      const neverSignedIn = !user.last_sign_in_at;
      
      return createdBeforeCutoff && neverConfirmed && neverSignedIn;
    });

    console.log(`[CLEANUP] Found ${unconfirmedUsers.length} unconfirmed users to clean up`);

    let deleted = 0;
    let errors = 0;

    for (const user of unconfirmedUsers) {
      try {
        const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
        
        if (deleteError) {
          console.error(`[CLEANUP] Error deleting user ${user.email}:`, deleteError.message);
          errors++;
        } else {
          console.log(`[CLEANUP] ✅ Deleted unconfirmed user: ${user.email} (created: ${user.created_at})`);
          deleted++;
        }
      } catch (err: any) {
        console.error(`[CLEANUP] Error deleting user ${user.email}:`, err.message);
        errors++;
      }
    }

    console.log(`[CLEANUP] Cleanup complete! Deleted: ${deleted}, Errors: ${errors}`);
    
    if (errors > 0) {
      console.warn(`[CLEANUP] Some users could not be deleted. Check logs above.`);
    }
  } catch (error: any) {
    console.error('[CLEANUP] Fatal error:', error.message);
    process.exit(1);
  }
}

// Run cleanup
cleanupUnconfirmedUsers()
  .then(() => {
    console.log('[CLEANUP] Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[CLEANUP] Script failed:', error);
    process.exit(1);
  });

