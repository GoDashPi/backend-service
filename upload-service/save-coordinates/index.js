'use strict';

const AWS = require('aws-sdk');
const { AWSConfig } = require('../shared');
const path = require('path');
const moment = require('moment');

const dynamodb = new AWS.DynamoDB.DocumentClient(AWSConfig);
const s3 = new AWS.S3(AWSConfig);

module.exports.handler = (event, context, callback) => {
  console.log(JSON.stringify(event, null, 2));
  const s3Object = event.Records[0].s3;
  console.log(s3Object);

  s3.getObject({
    Bucket: s3Object.bucket.name,
    Key: s3Object.object.key,
  }).promise()
    .then(({ Body }) => {
      const session = path.parse(s3Object.object.key).dir;
      const payload = JSON.parse(Body);
      const data = payload.map((p) => {
        return {
          session,
          latitude: p.lat === null ? false : p.lat,
          longitude: p.lon === null ? false : p.lon,
          altitude: p.alt,
          time: p.time,
          fix: p.fix === null ? false : p.fix,
          lastFix: moment(p.lastFix).toJSON(),
          timestamp: moment(p.lastFix).toJSON(),
          precision: {
            hdop: p.hdop,
            pdop: p.pdop,
            vdop: p.vdop,
          },
        };
      });
      console.log(data);
      // const promises = data.map(coordinate => dynamodb.put({
      //   TableName: process.env.COORDINATES_TABLE_NAME,
      //   Item: coordinate,
      // }).promise());
      // return promises;

      // dont save to dynamo while developing
      return Promise.resolve('ok');
    })
    .then(promises => Promise.all(promises))
    .then(() => callback(null, 'ok'));
};
