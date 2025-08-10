// Test script to verify deletion timing logic
const admin = require('firebase-admin');

// Test function to calculate deletion timing
function calculateDeletionTime(userType) {
    const deletionTimeMs = userType === 'free' ? 
        7 * 24 * 60 * 60000 : // 7 days for free users
        24 * 60 * 60000;      // 24 hours for premium users
    
    const deleteAt = new Date(Date.now() + deletionTimeMs);
    
    return {
        userType,
        deletionTimeMs,
        deleteAtTimestamp: deleteAt,
        hoursFromNow: deletionTimeMs / (60 * 60000),
        daysFromNow: deletionTimeMs / (24 * 60 * 60000)
    };
}

// Test cases
console.log('=== Video Deletion Timing Test ===\n');

console.log('Free User:');
const freeUser = calculateDeletionTime('free');
console.log(`- Deletion time: ${freeUser.hoursFromNow} hours (${freeUser.daysFromNow} days)`);
console.log(`- Delete at: ${freeUser.deleteAtTimestamp}`);
console.log('');

console.log('Premium User:');
const premiumUser = calculateDeletionTime('premium');
console.log(`- Deletion time: ${premiumUser.hoursFromNow} hours (${premiumUser.daysFromNow} days)`);
console.log(`- Delete at: ${premiumUser.deleteAtTimestamp}`);
console.log('');

console.log('Other User Types (defaults to premium timing):');
const otherUser = calculateDeletionTime('trial');
console.log(`- Deletion time: ${otherUser.hoursFromNow} hours (${otherUser.daysFromNow} days)`);
console.log(`- Delete at: ${otherUser.deleteAtTimestamp}`);

console.log('\n=== Test Complete ===');
