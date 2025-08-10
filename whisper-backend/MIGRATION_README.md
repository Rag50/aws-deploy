# Video Storage Migration: Azure to Amazon S3

## Summary of Changes

This update migrates the video storage system from Azure Blob Storage to Amazon S3 and removes the conditional saving logic. Now all videos are automatically saved for both free and paid users.

### Key Changes Made:

1. **Replaced Azure Blob Storage with Amazon S3**
   - Updated from `aws-sdk` v2 to `@aws-sdk/client-s3` v3
   - Replaced `uploadToAzure()` with `uploadToS3()`
   - Replaced `deleteFromAzure()` with `deleteFromS3()`

2. **Removed Conditional Saving Logic**
   - Removed `save` parameter from video processing endpoints
   - All videos now automatically save to S3 for both free and paid users
   - Simplified the video processing flow

3. **Updated Video Retention Policy**
   - Changed from 15-20 minutes to **1 hour** for all users
   - Videos now expire after 1 hour regardless of user type

4. **Enhanced Deletion Management**
   - Added automated cron job to process deletion tasks every 5 minutes
   - Updated deletion tasks to use S3 instead of Azure
   - Better error handling for failed deletions

5. **Updated Endpoints**
   - `/api/process-video` - Now saves to S3
   - `/api/change-style` - Always saves to S3, 1-hour retention
   - `/api/change-style-remotion` - Always saves to S3, 1-hour retention

### Environment Variables Required

Add these to your `.env` file:

```env
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=us-east-1
S3_BUCKET_NAME=caps-user-videos
```

### Database Changes

The Firestore deletion tasks now use:
- `type: 's3-object'` instead of `azure-blob`
- `bucketName` and `key` instead of `containerName` and `blobName`

### Testing

To test S3 connectivity, run:
```bash
node test-s3.js
```

### Benefits

1. **Simplified User Experience**: No more save/don't save confusion - all videos are saved
2. **Consistent Retention**: 1 hour for all users (increased from 15-20 minutes)
3. **Better Infrastructure**: S3 provides better reliability and global availability
4. **Cost Optimization**: S3 often provides better pricing than Azure Blob Storage
5. **Automatic Cleanup**: Robust cron job ensures no orphaned files

### Migration Notes

- Old Azure-based deletion tasks will need to be manually cleaned up
- Ensure S3 bucket exists and has public read permissions
- Update any client-side code that was checking for save/no-save logic
- Test with small video files first to verify the upload flow

### Potential Issues to Monitor

1. S3 bucket permissions for public read access
2. CORS configuration for S3 bucket if accessed from browser
3. AWS credentials validity and permissions
4. S3 region configuration matching your setup
