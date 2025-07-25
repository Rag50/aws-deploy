const fs = require('fs');
const path = require('path');

// Cleanup function for uploads directory
async function cleanupUploadsDirectory() {
    try {
        const uploadsDir = 'uploads/';
        if (!fs.existsSync(uploadsDir)) {
            console.log('Uploads directory does not exist');
            return;
        }

        const files = fs.readdirSync(uploadsDir);
        const now = Date.now();
        const maxAge = 30 * 60 * 1000; // 30 minutes
        let deletedCount = 0;

        console.log(`Found ${files.length} files in uploads directory`);

        for (const file of files) {
            const filePath = path.join(uploadsDir, file);
            const stats = fs.statSync(filePath);
            
            // Delete files older than 30 minutes
            if (now - stats.mtime.getTime() > maxAge) {
                try {
                    fs.unlinkSync(filePath);
                    console.log(`Deleted old file: ${file}`);
                    deletedCount++;
                } catch (error) {
                    console.error(`Error deleting file ${file}:`, error);
                }
            } else {
                console.log(`Keeping recent file: ${file} (age: ${Math.round((now - stats.mtime.getTime()) / 1000 / 60)} minutes)`);
            }
        }

        console.log(`Cleanup completed. Deleted ${deletedCount} files.`);
    } catch (error) {
        console.error('Error during uploads cleanup:', error);
    }
}

// Run cleanup
cleanupUploadsDirectory(); 