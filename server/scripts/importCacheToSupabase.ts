/**
 * Import cached Q&A pairs from JSON file to Supabase knowledge_base table
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createClient } from '@supabase/supabase-js';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CACHE_FILE = path.join(__dirname, '../data/chatbot_cache.json');

// Supabase configuration from environment
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase configuration!');
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in server/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface QAPair {
  prompt: string;
  response: string;
  timestamp: string;
  category?: string;
}

async function importCache() {
  console.log('🚀 Starting cache import to Supabase...\n');

  // Load cache file
  if (!fs.existsSync(CACHE_FILE)) {
    console.error(`❌ Cache file not found: ${CACHE_FILE}`);
    process.exit(1);
  }

  const cache: QAPair[] = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  console.log(`📦 Found ${cache.length} Q&A pairs to import\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  // Import in batches
  const batchSize = 50;
  for (let i = 0; i < cache.length; i += batchSize) {
    const batch = cache.slice(i, i + batchSize);
    
    console.log(`📥 Importing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(cache.length / batchSize)}...`);

    // Prepare batch data
    const insertData = batch.map(qa => ({
      prompt: qa.prompt,
      response: qa.response,
      category: qa.category || null,
      created_at: qa.timestamp || new Date().toISOString()
    }));

    // Insert with upsert (update if exists, insert if new)
    const { data, error } = await supabase
      .from('knowledge_base')
      .upsert(insertData, {
        onConflict: 'prompt'
      })
      .select();

    if (error) {
      console.error(`❌ Error importing batch:`, error.message);
      errorCount += batch.length;
    } else {
      const inserted = data?.length || 0;
      const skipped = batch.length - inserted;
      successCount += inserted;
      skipCount += skipped;
      
      if (inserted > 0) {
        console.log(`   ✅ Inserted ${inserted}, skipped ${skipped} duplicates`);
      } else {
        console.log(`   ⏭️  All ${batch.length} items were duplicates (skipped)`);
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Import Summary:');
  console.log(`✅ Successfully imported: ${successCount}`);
  console.log(`⏭️  Skipped (duplicates): ${skipCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`📦 Total processed: ${cache.length}`);
  console.log('='.repeat(50));

  // Verify import
  const { count } = await supabase
    .from('knowledge_base')
    .select('*', { count: 'exact', head: true });

  console.log(`\n📊 Total records in Supabase: ${count || 0}`);
}

// Run if executed directly
if (import.meta.url === `file://${path.resolve(__dirname, 'importCacheToSupabase.ts')}` ||
    process.argv[1]?.includes('importCacheToSupabase')) {
  importCache().catch(error => {
    console.error('❌ Import failed:', error);
    process.exit(1);
  });
}

export { importCache };
