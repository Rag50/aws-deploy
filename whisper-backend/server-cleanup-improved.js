// Improved cleanup function for server integration
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
            return { totalFiles: 0, deletedCount: 0, errorCount: 0 };
        }

        const files = await fs.readdir(uploadsDir);
        const now = Date.now();
        const maxAge = 30 * 60 * 1000; // 30 minutes
        let deletedCount = 0;
        let errorCount = 0;

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
                            console.log(`Cleaned up old file: ${file}`);
                            deletedCount++;
                        } else {
                            console.log(`Skipping file with unexpected extension: ${file} (${fileExt})`);
                        }
                    }
                } catch (error) {
                    console.error(`Error processing file ${file}:`, error.message);
                    errorCount++;
                }
            }));
            
            // Small delay between batches to prevent overwhelming the system
            if (i + batchSize < files.length) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        if (deletedCount > 0 || errorCount > 0) {
            console.log(`Cleanup completed. Deleted ${deletedCount} files, ${errorCount} errors.`);
        }
        
        return {
            totalFiles: files.length,
            deletedCount,
            errorCount,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('Error during uploads cleanup:', error);
        return { totalFiles: 0, deletedCount: 0, errorCount: 1 };
    }
}

// Enhanced cleanup with retry mechanism for server integration
async function cleanupWithRetry(maxRetries = 2) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await cleanupUploadsDirectory();
            return result;
        } catch (error) {
            console.error(`Cleanup attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('All cleanup attempts failed');
                return { totalFiles: 0, deletedCount: 0, errorCount: 1 };
            }
            
            // Wait before retrying (exponential backoff)
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Server integration function
function setupCleanupScheduler(intervalMinutes = 10) {
    const intervalMs = intervalMinutes * 60 * 1000;
    
    // Run initial cleanup
    cleanupWithRetry().catch(error => {
        console.error('Initial cleanup failed:', error);
    });
    
    // Set up periodic cleanup
    const cleanupInterval = setInterval(async () => {
        try {
            await cleanupWithRetry();
        } catch (error) {
            console.error('Periodic cleanup failed:', error);
        }
    }, intervalMs);
    
    // Return cleanup function for manual execution
    return {
        cleanup: cleanupWithRetry,
        stop: () => clearInterval(cleanupInterval)
    };
}

module.exports = {
    cleanupUploadsDirectory,
    cleanupWithRetry,
    setupCleanupScheduler
}; 