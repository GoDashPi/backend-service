'use strict';

const AWS = require('aws-sdk');
const path = require('path');

const s3 = new AWS.S3();

const config = {
  region: AWS.config.region || process.env.SERVERLESS_REGION || 'eu-west-1',
};

const dynamodb = new AWS.DynamoDB.DocumentClient(config);

const getFileType = (filePath) => {
  let fileType = '';
  switch (path.extname(filePath)) {
    case '.json':
      fileType = 'application/json';
      break;
    default:
      fileType = 'video/mp4';
      break;
  }

  return fileType;
};

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

const putChunk = (data) => {
  const payload = Object.assign({ status: 0 }, data);
  const params =
    Object.assign(
      { TableName: process.env.CHUNKS_TABLE_NAME },
      { Item: payload });
  return dynamodb.put(params).promise();
};

const getSignedUrl = filename =>
  new Promise((resolve, reject) => {
    s3.getSignedUrl('putObject', {
      Bucket: process.env.UPLOAD_BUCKET_NAME,
      Key: filename,
      ContentType: getFileType(filename),
    }, (error, url) => {
      if (error) {
        console.log(error);
        return reject(error);
      }
      return resolve(url);
    });
  });

module.exports.handler =
  (event, context, callback) => {
    const body = JSON.parse(event.body);
    const filename = body.key;
    const timestamp = (new Date(body.timestamp)).toJSON();
    const time = body.time;
    const { session } = body;
    return putChunk({ session, timestamp, filename, time })
      .then(() => getSignedUrl(filename))
      .then(url => callback(null, createResponse(null, { url })))
      .catch(error => callback(null, createResponse(error)));
  };
