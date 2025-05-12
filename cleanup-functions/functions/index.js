const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { BlobServiceClient } = require('@azure/storage-blob');

admin.initializeApp();
const blobServiceClient = BlobServiceClient.fromConnectionString(functions.config().azure.store);

exports.scheduledDeletion = functions.pubsub
  .schedule('every 1 minutes')
  .timeZone('UTC')
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const tasks = await admin.firestore()
      .collection('deletionTasks')
      .where('deleteAt', '<=', now)
      .get();

    const deletePromises = tasks.docs.map(async (doc) => {
      const task = doc.data();

      try {
        if (task.type === 'azure-blob') {
          const containerClient = blobServiceClient.getContainerClient(task.containerName);
          const blockBlobClient = containerClient.getBlockBlobClient(task.blobName);
          await blockBlobClient.delete();
          console.log(`Deleted Azure blob: ${task.blobName}`);
        }
        else if (task.type === 'firestore-doc') {
          await admin.firestore().doc(task.docPath).delete();
          console.log(`Deleted Firestore document: ${task.docPath}`);
        }

        await doc.ref.delete();
      } catch (error) {
        console.error(`Deletion failed for task ${doc.id}:`, error);
        await doc.ref.update({ error: error.message });
      }
    });

    await Promise.all(deletePromises);
    return null;
  });