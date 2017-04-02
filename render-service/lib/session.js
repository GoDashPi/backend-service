'use strict';

const AWS = require('aws-sdk');

const s3 = new AWS.S3();

const sessionExists = (sessionId) => {
  // now just check that there is a folder in bucket
  // future check that user has right to trigger
  // the process etc.
  return s3.headObject({
    Bucket: process.env.UPLOAD_BUCKET,
    Key: `${sessionId}/000001.h264`,
  }).promise();
};

module.exports = {
  sessionExists,
};
