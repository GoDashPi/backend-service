'use strict';

const AWS = require('aws-sdk');

const s3 = new AWS.S3();

const createResponse = (error, data) => {
  const statusCode = error ? 500 : 200;
  const body = error || data;
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(body),
  };
};

module.exports.handler =
  (event, context, callback) => {
    const filename = decodeURIComponent(event.pathParameters.key);
    return s3.getSignedUrl('putObject', {
      Bucket: process.env.UPLOAD_BUCKET_NAME,
      Key: filename,
      ContentType: 'video/mp4',
    }, (err, url) => callback(null, createResponse(err, { url, filename })));
  };
