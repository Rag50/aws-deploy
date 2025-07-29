const fs = require('fs').promises;
const path = require('path');

// Cleanup function for uploads directory
async function cleanupUploadsDirectory() {
    try {
        const uploadsDir = 'uploads/';
        
        // Check if uploads directory exists
        try {
            await fs.access(uploadsDir);
        } catch (error) {
            console.log('Uploads directory does not exist');
            return;
        }

        const files = await fs.readdir(uploadsDir);
        const now = Date.now();
        const maxAge = 30 * 60 * 1000; // 30 minutes
        let deletedCount = 0;
        let errorCount = 0;

        console.log(`Found ${files.length} files in uploads directory`);

        // Process files in batches to avoid overwhelming the system
        const batchSize = 10;
        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (file) => {
                try {
                    const filePath = path.join(uploadsDir, file);
                    const stats = await fs.stat(filePath);
                    
                    // Check if file is older than maxAge
                    if (now - stats.mtime.getTime() > maxAge) {
                        // Additional safety check - only delete common temporary file types
                        const allowedExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.srt', '.ass', '.wav', '.tmp'];
                        const fileExt = path.extname(file).toLowerCase();
                        
                        if (allowedExtensions.includes(fileExt)) {
                            await fs.unlink(filePath);
                            console.log(`Deleted old file: ${file}`);
                            deletedCount++;
                        } else {
                            console.log(`Skipping file with unexpected extension: ${file} (${fileExt})`);
                        }
                    } else {
                        const ageMinutes = Math.round((now - stats.mtime.getTime()) / 1000 / 60);
                        console.log(`Keeping recent file: ${file} (age: ${ageMinutes} minutes)`);
                    }
                } catch (error) {
                    console.error(`Error processing file ${file}:`, error.message);
                    errorCount++;
                }
            }));
            
            // Small delay between batches to prevent overwhelming the system
            if (i + batchSize < files.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        console.log(`Cleanup completed. Deleted ${deletedCount} files, ${errorCount} errors.`);
        
        // Return cleanup statistics
        return {
            totalFiles: files.length,
            deletedCount,
            errorCount,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('Error during uploads cleanup:', error);
        throw error;
    }
}

// Enhanced cleanup with retry mechanism
async function cleanupWithRetry(maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await cleanupUploadsDirectory();
            console.log('Cleanup successful:', result);
            return result;
        } catch (error) {
            console.error(`Cleanup attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('All cleanup attempts failed');
                throw error;
            }
            
            // Wait before retrying (exponential backoff)
            const delay = Math.pow(2, attempt) * 1000;
            console.log(`Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Run cleanup with retry mechanism
if (require.main === module) {
    cleanupWithRetry()
        .then(result => {
            console.log('Cleanup process completed successfully');
            process.exit(0);
        })
        .catch(error => {
            console.error('Cleanup process failed:', error);
            process.exit(1);
        });
}

module.exports = {
    cleanupUploadsDirectory,
    cleanupWithRetry
}; 