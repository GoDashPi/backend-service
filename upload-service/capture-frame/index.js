'use strict';

const AWS = require('aws-sdk');
const spawn = require('child_process').spawn;
const fs = require('fs-extra');
const BbPromise = require('bluebird');
const path = require('path');
const moment = require('moment');

const { spawnPromise } = require('../shared');

const writeFile = BbPromise.promisify(fs.writeFile);
const ensureDir = BbPromise.promisify(fs.ensureDir);
const readDir = BbPromise.promisify(fs.readdir);
const remove = BbPromise.promisify(fs.remove);

let ffmpeg; // todo: better implementation

const config = {
  region: AWS.config.region || process.env.SERVERLESS_REGION || 'eu-west-1',
};

const dynamodb = new AWS.DynamoDB.DocumentClient(config);
const s3 = new AWS.S3(config);

const captureFrames = ({ session, directory, filename, time }) => {
  const fps = 1 / 4;
  const frameTime = 1000 / fps;
  const { name } = path.parse(filename);
  const framesDirectory = path.join(directory, 'frames', name);
  const ceilTime = (Math.ceil(time / frameTime) * frameTime);
  const offset = ceilTime - ((time / frameTime) * frameTime);

  console.log('capture', JSON.stringify({ time, fps, frameTime, ceilTime, offset }));

  return remove(framesDirectory)
    .then(() => ensureDir(framesDirectory))
    .then(() => {
      const seek = moment(offset).utc().format('HH:mm:ss.SSS');
      const ffmpegArguments =
        `-i ${filename} -ss ${seek} -vf scale=320:-1:flags=lanczos,fps=${fps} ${path.join(framesDirectory, '%06d.png')}`;
      console.log(ffmpegArguments);
      return spawnPromise(spawn(ffmpeg, ffmpegArguments.split(' ')))
    })
    .then(() =>
      readDir(framesDirectory).then((frames) => {
        return frames.map((frame, index) => {
          const originalFrame = path.join(framesDirectory, frame);
          const newFrame = path.join(framesDirectory, `${ceilTime + index * frameTime}.png`);
          fs.moveSync(originalFrame, newFrame);
          return newFrame;
        });
      }));
};

const getChunk = (session, filename) => {
  const params = {
    TableName : process.env.CHUNKS_TABLE_NAME,
    ProjectionExpression: '#session, #timestamp, filename, #status, #time',
    KeyConditionExpression: '#session = :session and #timestamp > :timestamp',
    ExpressionAttributeNames:{
      '#session': 'session',
      '#timestamp': 'timestamp',
      '#status': 'status',
      '#time': 'time',
    },
    ExpressionAttributeValues: {
      ':session': session,
      ':timestamp': '0',
      ':filename': filename
    },
    FilterExpression: 'filename = :filename',
  };

  return dynamodb.query(params).promise()
    .then(({ Items }) => Items[0]);
};

const uploadFrames = ({ session, frames }) => {
  const promises = frames.map((frame) => {
    const { base } = path.parse(frame);
    const Key = `${session}/frames/${base}`;
    const params = {
      Bucket: process.env.UPLOAD_BUCKET_NAME,
      Key,
      Body: fs.readFileSync(frame),
      ContentType: 'image/png',
    };

    return s3.putObject(params).promise();
  });

  return Promise.all(promises);
};

// const updateChunkItem = (data) => {
//   const payload = Object.assign({ status: 1 }, data);
//   const params =
//     Object.assign(
//       {
//         TableName: process.env.CHUNKS_TABLE_NAME,
//         Key:
//       },
//       { Item: payload});
//   // return dynamodb.update(params).promise();
// };

module.exports.handler = (event, context, callback) => {
  ffmpeg = process.env.FFMPEG || './ffmpeg/ffmpeg'; // defaults to included ffmpeg binary

  const key = event.Records[0].s3.object.key;
  const s3path = path.parse(key);
  const session = s3path.dir;

  return getChunk(session, key)
    .then(chunk =>
      s3.getObject({ Bucket: process.env.UPLOAD_BUCKET_NAME, Key: key }).promise()
        .then(data => Object.assign({}, chunk, data)))
    .then((data) => {
        const directory = path.join('/', 'tmp', 'chunks', s3path.dir);
        const filename = path.join(directory, s3path.base);
        return ensureDir(directory)
          .then(() => writeFile(filename, data.Body))
          .then(() => ({ session, directory, filename, timestamp: data.timestamp, time: data.time }));
    })
    .then(captureFrames)
    .then(frames => uploadFrames({ session, frames }))
    .then(data => callback(null, data))
    .catch(error => callback(null, error));
};
