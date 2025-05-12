const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { BlobServiceClient } = require('@azure/storage-blob');

admin.initializeApp();
const db = admin.firestore();

const AZURE_CONNECTION_STRING = functions.config().azure.conn;

exports.deleteExpiredResources = functions.pubsub
  .schedule('every 24 hours') // You can also use a cron string like '0 * * * *' for hourly
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const snapshot = await db.collection('scheduledDeletions')
      .where('deleteAt', '<=', now)
      .get();

    if (snapshot.empty) {
      console.log('No expired deletions found.');
      return null;
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_CONNECTION_STRING);

    for (const doc of snapshot.docs) {
      const data = doc.data();
      try {
        if (data.type === 'file') {
          const containerClient = blobServiceClient.getContainerClient(data.container);
          const blobClient = containerClient.getBlockBlobClient(data.blobName);
          await blobClient.deleteIfExists();
          console.log(`Deleted Azure blob: ${data.blobName}`);
        } else if (data.type === 'doc') {
          const docPath = `${data.path}/${data.docId}`;
          await db.doc(docPath).delete();
          console.log(`Deleted Firestore doc: ${docPath}`);
        }
        await doc.ref.delete(); // Clean up from scheduledDeletions
      } catch (err) {
        console.error('Error deleting resource:', err);
      }
    }

    return null;
  });

