import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://qehutxejkzutknxfptkb.supabase.co";
const supabaseAnonKey = "sb_publishable_8skz8cz1myVwW4l2xmuk_A_dt-xbO0a";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);