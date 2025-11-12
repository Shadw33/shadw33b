/**
 * Update a single response in Supabase
 * Usage: tsx scripts/updateSingleResponse.ts "prompt text" "response text"
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase configuration!');
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);
async function updateResponse(prompt, response) {
    const { data, error } = await supabase
        .from('knowledge_base')
        .update({
        response: response.trim(),
        updated_at: new Date().toISOString()
    })
        .eq('prompt', prompt)
        .select();
    if (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
    if (data && data.length > 0) {
        console.log(`✅ Updated: "${prompt}"`);
    }
    else {
        console.error(`❌ No record found for: "${prompt}"`);
        process.exit(1);
    }
}
// Get prompt and response from command line or environment
const prompt = process.argv[2];
const response = process.argv[3] || process.env.RESPONSE_TEXT;
if (!prompt || !response) {
    console.error('Usage: tsx updateSingleResponse.ts "prompt" "response"');
    console.error('Or set RESPONSE_TEXT environment variable');
    process.exit(1);
}
updateResponse(prompt, response).catch(error => {
    console.error('❌ Failed:', error);
    process.exit(1);
});
//# sourceMappingURL=updateSingleResponse.js.map