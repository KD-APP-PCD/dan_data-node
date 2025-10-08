/**
 * Script để fix player_index = null thành player_index = 0, 1, 2, 3
 * trong match.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const matchId = '20251008_2L717P_test3';
const matchJsonPath = path.join(__dirname, 'storage', matchId, 'match.json');

console.log(`🔧 Fixing player_index in: ${matchJsonPath}`);

// Read match.json
const matchData = JSON.parse(fs.readFileSync(matchJsonPath, 'utf8'));

// Fix khoi_dong_rieng
if (matchData.sections.khoi_dong_rieng && matchData.sections.khoi_dong_rieng.players) {
  console.log('\n📝 Fixing khoi_dong_rieng...');
  
  const players = matchData.sections.khoi_dong_rieng.players;
  
  // Sort players by their first question's order
  players.sort((a, b) => {
    const orderA = a.questions[0]?.order ?? 999;
    const orderB = b.questions[0]?.order ?? 999;
    return orderA - orderB;
  });
  
  // Assign correct player_index
  players.forEach((player, index) => {
    console.log(`   Player ${index}: ${player.questions.length} questions`);
    player.player_index = index;
  });
}

// Fix ve_dich (nếu có)
if (matchData.sections.ve_dich && matchData.sections.ve_dich.players) {
  console.log('\n📝 Fixing ve_dich...');
  
  const players = matchData.sections.ve_dich.players;
  
  // Sort players by their first question's order
  players.sort((a, b) => {
    const orderA = a.questions[0]?.order ?? 999;
    const orderB = b.questions[0]?.order ?? 999;
    return orderA - orderB;
  });
  
  // Assign correct player_index
  players.forEach((player, index) => {
    console.log(`   Player ${index}: ${player.questions.length} questions`);
    player.player_index = index;
  });
}

// Update last_updated
matchData.statistics.last_updated = new Date().toISOString();

// Write back
fs.writeFileSync(matchJsonPath, JSON.stringify(matchData, null, 2), 'utf8');

console.log('\n✅ Fixed! New structure:');
console.log(JSON.stringify(matchData.sections.khoi_dong_rieng.players, null, 2));

