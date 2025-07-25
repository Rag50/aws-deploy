const fs = require('fs');
const path = require('path');

// Test function to create a large file for testing
function createTestFile(filename, sizeInMB) {
    const sizeInBytes = sizeInMB * 1024 * 1024;
    const buffer = Buffer.alloc(sizeInBytes);
    
    // Fill with some data
    for (let i = 0; i < buffer.length; i++) {
        buffer[i] = Math.floor(Math.random() * 256);
    }
    
    fs.writeFileSync(filename, buffer);
    console.log(`Created test file: ${filename} (${sizeInMB}MB)`);
}

// Test the uploads directory
function testUploadsDirectory() {
    const uploadsDir = 'uploads/';
    
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log('Created uploads directory');
    }
    
    // Check current files
    const files = fs.readdirSync(uploadsDir);
    console.log(`Current files in uploads: ${files.length}`);
    
    // Create a test file that's too large (60MB)
    const largeTestFile = path.join(uploadsDir, 'test-large.mp4');
    createTestFile(largeTestFile, 60);
    
    // Create a test file that's within limits (30MB)
    const smallTestFile = path.join(uploadsDir, 'test-small.mp4');
    createTestFile(smallTestFile, 30);
    
    console.log('Test files created. You can now test the upload endpoints.');
    console.log('Large file (60MB) should be rejected.');
    console.log('Small file (30MB) should be accepted.');
}

// Run the test
testUploadsDirectory(); 