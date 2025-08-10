const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
const dotenv = require('dotenv');

dotenv.config();

// Test S3 connection
async function testS3Connection() {
    try {
        const s3Client = new S3Client({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
        });

        console.log('Testing S3 connection...');
        
        const command = new ListBucketsCommand({});
        const response = await s3Client.send(command);
        
        console.log('✅ S3 connection successful!');
        console.log('Available buckets:');
        response.Buckets.forEach(bucket => {
            console.log(`  - ${bucket.Name}`);
        });
        
        // Check if our target bucket exists
        const targetBucket = process.env.S3_BUCKET_NAME || 'caps-user-videos';
        const bucketExists = response.Buckets.some(bucket => bucket.Name === targetBucket);
        
        if (bucketExists) {
            console.log(`✅ Target bucket "${targetBucket}" exists!`);
        } else {
            console.log(`⚠️  Target bucket "${targetBucket}" not found. You may need to create it.`);
        }
        
    } catch (error) {
        console.error('❌ S3 connection failed:');
        console.error(error.message);
        
        if (error.name === 'CredentialsError') {
            console.log('\n💡 Please check your AWS credentials in the .env file:');
            console.log('   - AWS_ACCESS_KEY_ID');
            console.log('   - AWS_SECRET_ACCESS_KEY');
            console.log('   - AWS_REGION');
        }
    }
}

testS3Connection();
